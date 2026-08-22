import assert from "node:assert/strict";
import test from "node:test";
import { getDbProvider, getPostgresConnectionString, toPostgresPlaceholders } from "./db.js";

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
