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
    routes_json TEXT,
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
    oidc_issuer TEXT,
    oidc_subject TEXT,
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

/**
 * Existing deployments predate stable OIDC identifiers. Add the nullable
 * columns in place, then enforce uniqueness only once both values exist.
 */
export async function migrateUserIdentityColumns(database: Database, provider: DbProvider) {
  if (provider === "postgres") {
    await database.exec(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_issuer TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_subject TEXT;
    `);
  } else {
    const columns = await database.all<{ name: string }>("PRAGMA table_info(users)");
    if (!columns.some((column) => column.name === "oidc_issuer")) {
      await database.exec("ALTER TABLE users ADD COLUMN oidc_issuer TEXT");
    }
    if (!columns.some((column) => column.name === "oidc_subject")) {
      await database.exec("ALTER TABLE users ADD COLUMN oidc_subject TEXT");
    }
  }

  await database.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS users_oidc_identity ON users(oidc_issuer, oidc_subject) WHERE oidc_issuer IS NOT NULL AND oidc_subject IS NOT NULL",
  );
}

// Route alternatives were added after the original cache schema. Keep the
// existing primary-route columns for compatibility and retain all returned
// options in a small JSON column.
export async function migrateLegRoutesColumn(database: Database, provider: DbProvider) {
  if (provider === "postgres") {
    await database.exec("ALTER TABLE legs ADD COLUMN IF NOT EXISTS routes_json TEXT");
    return;
  }
  const columns = await database.all<{ name: string }>("PRAGMA table_info(legs)");
  if (!columns.some((column) => column.name === "routes_json")) {
    await database.exec("ALTER TABLE legs ADD COLUMN routes_json TEXT");
  }
}

export function getDbProvider(env: NodeJS.ProcessEnv = process.env): DbProvider {
  const provider = env.DB_PROVIDER ?? "sqlite";
  if (provider === "sqlite" || provider === "postgres") return provider;
  throw new Error(`Invalid DB_PROVIDER \"${provider}\". Use \"sqlite\" or \"postgres\".`);
}

/**
 * PostgreSQL settings intentionally use only the DB_POSTGRES_* namespace.
 * A complete URL is convenient for managed providers; the component form
 * makes each credential explicit for secret-backed deployments.
 */
export function getPostgresConnectionString(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DB_POSTGRES_URL) return env.DB_POSTGRES_URL;

  const requiredSettings = [
    "DB_POSTGRES_HOST",
    "DB_POSTGRES_DATABASE",
    "DB_POSTGRES_USERNAME",
    "DB_POSTGRES_PASSWORD",
  ] as const;
  const missingSettings = requiredSettings.filter((name) => !env[name]);
  if (missingSettings.length > 0) {
    throw new Error(
      `DB_POSTGRES_URL or all of ${requiredSettings.join(", ")} are required when DB_PROVIDER=postgres. Missing: ${missingSettings.join(", ")}.`,
    );
  }

  const host = env.DB_POSTGRES_HOST!;
  const port = env.DB_POSTGRES_PORT ?? "5432";
  const database = encodeURIComponent(env.DB_POSTGRES_DATABASE!);
  const username = encodeURIComponent(env.DB_POSTGRES_USERNAME!);
  const password = encodeURIComponent(env.DB_POSTGRES_PASSWORD!);
  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
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
    const connectionString = getPostgresConnectionString();
    const database = new PostgresDatabase(new Pool({ connectionString }));
    await database.exec(SCHEMA);
    await migrateUserIdentityColumns(database, provider);
    await migrateLegRoutesColumn(database, provider);
    return database;
  }

  const path = process.env.DB_SQLITE_PATH ?? "./data/mungchilog.db";
  mkdirSync(dirname(path), { recursive: true });
  const database = new SqliteDatabase(new DatabaseSync(path));
  // The cluster's SQLite volume is NFS-backed. WAL depends on locking that
  // is not reliable there, so retain the safe rollback journal mode.
  await database.exec("PRAGMA journal_mode = DELETE;");
  await database.exec("PRAGMA busy_timeout = 5000;");
  await database.exec(SCHEMA);
  await migrateUserIdentityColumns(database, provider);
  await migrateLegRoutesColumn(database, provider);
  return database;
}

export const db = await createDatabase();
