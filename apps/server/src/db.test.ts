import assert from "node:assert/strict";
import test from "node:test";
import { getDbProvider, toPostgresPlaceholders } from "./db.js";

test("SQLite remains the default provider", () => {
  assert.equal(getDbProvider({}), "sqlite");
  assert.equal(getDbProvider({ DB_PROVIDER: "sqlite" }), "sqlite");
  assert.equal(getDbProvider({ DB_PROVIDER: "postgres" }), "postgres");
});

test("invalid providers are rejected with a useful error", () => {
  assert.throws(() => getDbProvider({ DB_PROVIDER: "mysql" }), /DB_PROVIDER.*sqlite.*postgres/);
});

test("PostgreSQL placeholder conversion preserves quoted question marks", () => {
  assert.equal(
    toPostgresPlaceholders("SELECT * FROM trips WHERE id = ? AND title = '?' AND updated_at > ?"),
    "SELECT * FROM trips WHERE id = $1 AND title = '?' AND updated_at > $2",
  );
});
