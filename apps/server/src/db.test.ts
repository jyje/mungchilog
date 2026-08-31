import assert from "node:assert/strict";
import test from "node:test";
import { getDbProvider, getPostgresConnectionString, migrateLegRoutesColumn, migrateUserIdentityColumns, toPostgresPlaceholders, type Database } from "./db.js";

test("SQLite remains the default provider", () => {
  assert.equal(getDbProvider({}), "sqlite");
  assert.equal(getDbProvider({ DB_PROVIDER: "sqlite" }), "sqlite");
  assert.equal(getDbProvider({ DB_PROVIDER: "postgres" }), "postgres");
});

test("invalid providers are rejected with a useful error", () => {
  assert.throws(() => getDbProvider({ DB_PROVIDER: "mysql" }), /DB_PROVIDER.*sqlite.*postgres/);
});

test("PostgreSQL accepts a namespaced URL or namespaced connection components", () => {
  assert.equal(
    getPostgresConnectionString({ DB_POSTGRES_URL: "postgresql://managed.example/mungchilog" }),
    "postgresql://managed.example/mungchilog",
  );
  assert.equal(
    getPostgresConnectionString({
      DB_POSTGRES_HOST: "db.example",
      DB_POSTGRES_PORT: "6543",
      DB_POSTGRES_DATABASE: "mungchilog",
      DB_POSTGRES_USERNAME: "travel user",
      DB_POSTGRES_PASSWORD: "p@ss/word",
    }),
    "postgresql://travel%20user:p%40ss%2Fword@db.example:6543/mungchilog",
  );
});

test("PostgreSQL reports only namespaced missing settings", () => {
  assert.throws(
    () => getPostgresConnectionString({ DB_POSTGRES_HOST: "db.example" }),
    /DB_POSTGRES_URL.*DB_POSTGRES_DATABASE.*DB_POSTGRES_USERNAME.*DB_POSTGRES_PASSWORD/,
  );
});

test("PostgreSQL placeholder conversion preserves quoted question marks", () => {
  assert.equal(
    toPostgresPlaceholders("SELECT * FROM trips WHERE id = ? AND title = '?' AND updated_at > ?"),
    "SELECT * FROM trips WHERE id = $1 AND title = '?' AND updated_at > $2",
  );
});

test("SQLite user identity migration adds missing columns and a unique identity index", async () => {
  const statements: string[] = [];
  const database: Database = {
    get: async <T>() => undefined as T | undefined,
    all: async <T>() => [{ name: "id" }, { name: "email" }] as T[],
    run: async () => ({ changes: 0 }),
    exec: async (sql) => { statements.push(sql); },
    close: async () => {},
  };

  await migrateUserIdentityColumns(database, "sqlite");

  assert.deepEqual(statements, [
    "ALTER TABLE users ADD COLUMN oidc_issuer TEXT",
    "ALTER TABLE users ADD COLUMN oidc_subject TEXT",
    "CREATE UNIQUE INDEX IF NOT EXISTS users_oidc_identity ON users(oidc_issuer, oidc_subject) WHERE oidc_issuer IS NOT NULL AND oidc_subject IS NOT NULL",
  ]);
});

test("SQLite leg migration adds the route alternatives cache column", async () => {
  const statements: string[] = [];
  const database: Database = {
    get: async <T>() => undefined as T | undefined,
    all: async <T>() => [{ name: "id" }, { name: "polyline" }] as T[],
    run: async () => ({ changes: 0 }),
    exec: async (sql) => { statements.push(sql); },
    close: async () => {},
  };

  await migrateLegRoutesColumn(database, "sqlite");

  assert.deepEqual(statements, ["ALTER TABLE legs ADD COLUMN routes_json TEXT"]);
});
