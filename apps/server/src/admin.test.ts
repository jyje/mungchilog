import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { Hono } from "hono";
import { sessionStorageId } from "./session-security.js";

const fixtureDirectory = mkdtempSync(join(tmpdir(), "mungchilog-admin-test-"));
process.env.DB_PROVIDER = "sqlite";
process.env.DB_SQLITE_PATH = join(fixtureDirectory, "fixture.sqlite");
process.env.NODE_ENV = "production";
process.env.OIDC_ISSUER_URL = "https://identity.example.test/";
process.env.OIDC_CLIENT_ID = "fixture-client";
process.env.OIDC_CLIENT_SECRET = "fixture-only-not-a-real-secret";
process.env.OIDC_REDIRECT_URI = "https://travel.example.test/auth/callback";
delete process.env.INITIAL_ADMIN_EMAIL;
delete process.env.ADMIN_EMAIL;

const { db } = await import("./db.js");
const { admin } = await import("./routes/admin.js");
const app = new Hono();
app.route("/api/admin", admin);

before(async () => {
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  for (const [id, status, role] of [
    ["admin", "approved", "admin"],
    ["member", "approved", "member"],
    ["pending", "pending", "member"],
  ] as const) {
    await db.run("INSERT INTO users (id,email,status,role,created_at) VALUES (?,?,?,?,?)", [id, `${id}@example.test`, status, role, now]);
    await db.run("INSERT INTO sessions (id,user_id,created_at,expires_at) VALUES (?,?,?,?)", [
      sessionStorageId(`fixture-${id}`), id, now, new Date(Date.now() + 86_400_000).toISOString(),
    ]);
  }
  await db.run("INSERT INTO trips (id,title,start_date,end_date,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", [
    "trip-one", "Trip", "2026-08-31", "2026-08-31", "{}", now, now,
  ]);
  await db.run("INSERT INTO trip_members (trip_id,user_id,role,created_at) VALUES (?,?,?,?)", ["trip-one", "member", "editor", now]);
  await db.run("INSERT INTO legs (id,from_place_id,to_place_id,mode,bucket,fetched_at) VALUES (?,?,?,?,?,?)", ["fresh-leg", "a", "b", "WALK", "Mon-1", now]);
  await db.run("INSERT INTO legs (id,from_place_id,to_place_id,mode,bucket,fetched_at) VALUES (?,?,?,?,?,?)", ["old-leg", "b", "c", "WALK", "Mon-1", old]);
  await db.run("INSERT INTO places (place_id,fetched_at) VALUES (?,?)", ["fresh-place", now]);
});

after(async () => {
  await db.close();
  rmSync(fixtureDirectory, { recursive: true, force: true });
});

function request(user: string | null, path = "/api/admin/usage?window=24h") {
  return app.request(path, { headers: user ? { cookie: `mungchilog_session=fixture-${user}` } : {} });
}

test("usage is unavailable before authentication and approval", async () => {
  assert.equal((await request(null)).status, 401);
  assert.equal((await request("pending")).status, 403);
  assert.equal((await request("member")).status, 403);
});

test("an administrator receives bounded aggregate usage", async () => {
  const response = await request("admin");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.deepEqual(body.application, {
    users: { pending: 1, approved: 2 },
    trips: 1,
    memberships: 1,
    routeCache: { entries: 2, freshEntries: 1 },
    placeCache: { entries: 1, freshEntries: 1 },
  });
  assert.deepEqual(body.google, { status: "disabled", reason: "not-configured" });
});

test("usage accepts only documented windows", async () => {
  assert.equal((await request("admin", "/api/admin/usage?window=1y")).status, 400);
  assert.equal((await request("admin", "/api/admin/usage?window=30d")).status, 200);
});
