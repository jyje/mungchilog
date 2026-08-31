import assert from "node:assert/strict";
import test from "node:test";
import { readApplicationUsage } from "./admin-usage.js";
import type { Database } from "./db.js";

test("application usage normalizes PostgreSQL string counts", async () => {
  let receivedSql = "";
  let receivedParams: unknown[] = [];
  const database = {
    get: async <T>(sql: string, params: unknown[] = []) => {
      receivedSql = sql;
      receivedParams = params;
      return {
        users_pending: "2",
        users_approved: "7",
        trips: "5",
        memberships: "13",
        route_cache_entries: "9",
        route_cache_fresh: "6",
        place_cache_entries: "4",
        place_cache_fresh: "3",
      } as T;
    },
  } as Pick<Database, "get">;

  const result = await readApplicationUsage(database, new Date("2026-08-31T00:00:00.000Z"));

  assert.deepEqual(result, {
    users: { pending: 2, approved: 7 },
    trips: 5,
    memberships: 13,
    routeCache: { entries: 9, freshEntries: 6 },
    placeCache: { entries: 4, freshEntries: 3 },
  });
  assert.match(receivedSql, /SELECT COUNT\(\*\) FROM users/);
  assert.deepEqual(receivedParams, ["2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"]);
});

test("invalid aggregate values fail closed to zero", async () => {
  const database = {
    get: async <T>() => ({
      users_pending: "invalid",
      users_approved: -1,
      trips: 0,
      memberships: 0,
      route_cache_entries: 0,
      route_cache_fresh: 0,
      place_cache_entries: 0,
      place_cache_fresh: 0,
    }) as T,
  } as Pick<Database, "get">;

  const result = await readApplicationUsage(database);
  assert.deepEqual(result.users, { pending: 0, approved: 0 });
});
