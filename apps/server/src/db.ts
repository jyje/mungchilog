import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";

type DbValue = string | number | null;
export type DbRunResult = { changes: number };

export type Database = {
  get<T>(sql: string, params?: DbValue[]): Promise<T | undefined>;
  all<T>(sql: string, params?: DbValue[]): Promise<T[]>;
  run(sql: string, params?: DbValue[]): Promise<DbRunResult>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
};

export type DbProvider = "sqlite" | "postgres";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS legs (
    id TEXT PRIMARY KEY,
    from_place_id TEXT NOT NULL,
    to_place_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    bucket TEXT NOT NULL,
    distance_m INTEGER,
    duration_s INTEGER,
    fare_amount INTEGER,
    fare_currency TEXT,
    polyline TEXT,
    fetched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS places (
    place_id TEXT PRIMARY KEY,
    opening_hours TEXT,
    fetched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trip_members (
    trip_id TEXT NOT NULL REFERENCES trips(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'editor',
    created_at TEXT NOT NULL,
    PRIMARY KEY (trip_id, user_id)
  );
`;

export function getDbProvider(env: NodeJS.ProcessEnv = process.env): DbProvider {
  const provider = env.DB_PROVIDER ?? "sqlite";
  if (provider === "sqlite" || provider === "postgres") return provider;
  throw new Error(`Invalid DB_PROVIDER \"${provider}\". Use \"sqlite\" or \"postgres\".`);
}

/** Converts the SQLite-style placeholders used by the application into the
 * numbered placeholders PostgreSQL expects. Current queries do not put ? in
 * string literals, but the small scanner keeps quoted literals intact. */
export function toPostgresPlaceholders(sql: string): string {
  let index = 0;
  let quoted = false;
  let result = "";

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (char === "'") {
      result += char;
      if (quoted && sql[i + 1] === "'") {
        result += sql[i + 1];
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    result += char === "?" && !quoted ? `$${++index}` : char;
  }
  return result;
}

class SqliteDatabase implements Database {
  constructor(private readonly connection: DatabaseSync) {}

  async get<T>(sql: string, params: DbValue[] = []): Promise<T | undefined> {
    return this.connection.prepare(sql).get(...params) as T | undefined;
  }

  async all<T>(sql: string, params: DbValue[] = []): Promise<T[]> {
    return this.connection.prepare(sql).all(...params) as T[];
  }

  async run(sql: string, params: DbValue[] = []): Promise<DbRunResult> {
    const result = this.connection.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  }

  async exec(sql: string): Promise<void> {
    this.connection.exec(sql);
  }

  async close(): Promise<void> {
    this.connection.close();
  }
}

class PostgresDatabase implements Database {
  constructor(private readonly pool: Pool) {}

  async get<T>(sql: string, params: DbValue[] = []): Promise<T | undefined> {
    const result = await this.pool.query(toPostgresPlaceholders(sql), params);
    return result.rows[0] as T | undefined;
  }

  async all<T>(sql: string, params: DbValue[] = []): Promise<T[]> {
    const result = await this.pool.query(toPostgresPlaceholders(sql), params);
    return result.rows as T[];
  }

  async run(sql: string, params: DbValue[] = []): Promise<DbRunResult> {
    const result = await this.pool.query(toPostgresPlaceholders(sql), params);
    return { changes: result.rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

async function createDatabase(): Promise<Database> {
  const provider = getDbProvider();
  if (provider === "postgres") {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required when DB_PROVIDER=postgres.");
    const database = new PostgresDatabase(new Pool({ connectionString }));
    await database.exec(SCHEMA);
    return database;
  }

  const path = process.env.DB_PATH ?? "./data/mungchilog.db";
  mkdirSync(dirname(path), { recursive: true });
  const database = new SqliteDatabase(new DatabaseSync(path));
  // The cluster's SQLite volume is NFS-backed. WAL depends on locking that
  // is not reliable there, so retain the safe rollback journal mode.
  await database.exec("PRAGMA journal_mode = DELETE;");
  await database.exec("PRAGMA busy_timeout = 5000;");
  await database.exec(SCHEMA);
  return database;
}

export const db = await createDatabase();
