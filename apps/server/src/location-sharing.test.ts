import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, type TestContext } from "node:test";
import { Hono } from "hono";
import { sessionStorageId } from "./session-security.js";

// Set isolation before importing any module that opens the application DB.
const fixtureDirectory = mkdtempSync(join(tmpdir(), "mungchilog-location-test-"));
process.env.DB_PROVIDER = "sqlite";
process.env.DB_SQLITE_PATH = join(fixtureDirectory, "fixture.sqlite");
process.env.NODE_ENV = "production";
process.env.OIDC_ISSUER_URL = "https://identity.example.test/";
process.env.OIDC_CLIENT_ID = "fixture-client";
process.env.OIDC_CLIENT_SECRET = "fixture-only-not-a-real-secret";
process.env.OIDC_REDIRECT_URI = "https://travel.example.test/auth/callback";
delete process.env.INITIAL_ADMIN_EMAIL;
delete process.env.ADMIN_EMAIL;
process.env.LOCATION_SHARING_ENABLED = "true";
process.env.LOCATION_SHARING_SINGLE_PROCESS = "true";

const { db } = await import("./db.js");
const { auth, requireSameOrigin, setUserStatus } = await import("./auth.js");
const { locationSharing } = await import("./routes/location-sharing.js");
const { trips } = await import("./routes/trips.js");
const { admin } = await import("./routes/admin.js");
const { locationSharingStore: store, isLocationSharingEnabled } = await import("./location-sharing-store.js");
const { addMember, removeMember } = await import("./membership.js");
const app = new Hono();
app.route("/auth", auth);
app.route("/api/trips", locationSharing);
app.use("/api/*", requireSameOrigin);
app.route("/api/trips", trips);
app.route("/api/admin", admin);
const origin = "https://travel.example.test";
const base = "/api/trips/trip-one/location-sharing";
const otherBase = "/api/trips/trip-two/location-sharing";
let fixtureNumber = 0;

after(async () => {
  await db.close();
  rmSync(fixtureDirectory, { recursive: true, force: true });
});

async function reset(t: TestContext) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-01T12:00:00Z").getTime() + ++fixtureNumber * 86_400_000 });
  process.env.LOCATION_SHARING_ENABLED = "true";
  process.env.LOCATION_SHARING_SINGLE_PROCESS = "true";
  store.sessions.clear();
  store.consents.clear();
  store.prune();
  await db.exec("DELETE FROM sessions; DELETE FROM trip_members; DELETE FROM users; DELETE FROM trips;");
  const now = new Date().toISOString();
  for (const user of ["owner", "viewer", "outsider", "admin", "pending"]) {
    await db.run("INSERT INTO users (id,email,name,status,role,created_at) VALUES (?,?,?,?,?,?)", [
      user, `${user}@example.test`, user, user === "pending" ? "pending" : "approved", user === "admin" ? "admin" : "member", now,
    ]);
    for (const device of ["a", "b"]) {
      await db.run("INSERT INTO sessions (id,user_id,created_at,expires_at) VALUES (?,?,?,?)", [
        sessionStorageId(`fixture-${user}-${device}`), user, now, new Date(Date.now() + 30 * 86_400_000).toISOString(),
      ]);
    }
  }
  for (const trip of ["trip-one", "trip-two"]) {
    await db.run("INSERT INTO trips (id,title,start_date,end_date,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", [
      trip, trip, "2026-08-01", "2026-08-01", JSON.stringify({ title: trip, startDate: "2026-08-01", endDate: "2026-08-01", days: [] }), now, now,
    ]);
    await addMember(trip, "owner", "owner");
  }
  await addMember("trip-one", "viewer", "editor");
}

function scenario(name: string, run: (t: TestContext) => Promise<void>) {
  test(name, async (t) => { await reset(t); await run(t); });
}

function headers(user: string | null = "owner", device = "a") {
  return { origin, "content-type": "application/json", ...(user ? { cookie: `mungchilog_session=fixture-${user}-${device}` } : {}) };
}

async function request(method: string, path = base, body?: unknown, user: string | null = "owner", device = "a") {
  return app.request(`${origin}${path}`, { method, headers: headers(user, device), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function confirmation(path = base, user = "owner", device = "a") {
  const result = await request("GET", `${path}/consent`, undefined, user, device);
  assert.equal(result.status, 200);
  const body = await result.json();
  return { consent: true, consentToken: body.consentToken, audienceVersion: body.audienceVersion };
}

async function start(path = base, user = "owner", device = "a", extra = {}) {
  const response = await request("POST", path, { ...await confirmation(path, user, device), ...extra }, user, device);
  assert.equal(response.status, 201);
  return response.json() as Promise<{ sharingSessionId: string; expiresAt: number }>;
}

function position(sharingSessionId: string, extra = {}) {
  return { sharingSessionId, lat: 37.5, lng: 127, accuracy: 12, measuredAt: Date.now(), ...extra };
}

scenario("sharing fails closed unless both single-process opt-ins are set", async () => {
  assert.equal(isLocationSharingEnabled({}), false);
  assert.equal(isLocationSharingEnabled({ LOCATION_SHARING_ENABLED: "true" }), false);
  process.env.LOCATION_SHARING_SINGLE_PROCESS = "false";
  const response = await request("GET");
  assert.equal(response.status, 503);
  assert.match(response.headers.get("cache-control")!, /no-store/);
});

scenario("two participants share and a nonsharing member can read only their trip", async () => {
  const first = await start();
  assert.equal((await request("PUT", base, position(first.sharingSessionId))).status, 200);
  const list = await request("GET", base, undefined, "viewer");
  assert.equal(list.status, 200);
  assert.match(list.headers.get("cache-control")!, /no-store/);
  const body = await list.json();
  assert.equal(body.locations.length, 1);
  assert.equal(body.locations[0].userId, "owner");
  assert.equal(body.locations[0].lat, 37.5);
  assert.equal(JSON.stringify(body).includes(first.sharingSessionId), false);
  assert.equal(body.ownSharing, null);
  const second = await start(base, "viewer");
  assert.equal((await request("PUT", base, position(second.sharingSessionId), "viewer")).status, 200);
  assert.equal((await (await request("GET")).json()).locations.length, 2);
  assert.equal((await (await request("GET", otherBase)).json()).locations.length, 0);
});

scenario("unauthenticated, pending, nonmember and nonmember administrator requests are denied", async () => {
  for (const [user, status] of [[null, 401], ["pending", 403], ["outsider", 404], ["admin", 404]] as const) {
    for (const path of [base, `${base}/consent`]) {
      const response = await request("GET", path, undefined, user);
      assert.equal(response.status, status);
      assert.match(response.headers.get("cache-control")!, /no-store/);
    }
    const body = { consent: true, consentToken: "00000000-0000-4000-8000-000000000000", audienceVersion: "a".repeat(64) };
    assert.equal((await request("POST", base, body, user)).status, status);
    assert.equal((await request("PUT", base, position(body.consentToken), user)).status, status);
    assert.equal((await request("DELETE", base, { sharingSessionId: body.consentToken }, user)).status, status);
  }
});

scenario("all mutations require exact same-origin JSON and bounded nonreflecting payloads", async () => {
  const active = await start();
  for (const method of ["POST", "PUT", "DELETE"]) {
    const response = await app.request(`${origin}${base}`, { method, headers: { ...headers(), origin: "https://sibling.example.test" }, body: "{}" });
    assert.equal(response.status, 403);
    assert.match(response.headers.get("cache-control")!, /no-store/);
  }
  const noOrigin = headers();
  delete (noOrigin as Record<string, string>).origin;
  assert.equal((await app.request(`${origin}${base}`, { method: "DELETE", headers: noOrigin, body: "{}" })).status, 403);
  assert.equal((await app.request(`${origin}${base}`, { method: "PUT", headers: { ...headers(), "content-type": "text/plain" }, body: "{}" })).status, 415);
  assert.equal((await request("PUT", base, { ...position(active.sharingSessionId), unexpected: "x".repeat(2000) })).status, 413);
  assert.equal((await request("GET", `${base}?lat=1`)).status, 400);
  assert.equal((await request("PUT", base, position(active.sharingSessionId, { userId: "viewer" }))).status, 400);
  const invalid = await request("PUT", base, position(active.sharingSessionId, { lat: 555 }));
  assert.deepEqual(await invalid.json(), { error: "invalid position" });
});

scenario("recipient consent is explicit, current, short lived and single use", async (t) => {
  const intent = await confirmation();
  assert.equal((await request("POST", base, { ...intent, consent: false })).status, 400);
  assert.equal((await request("POST", base, { ...intent, durationSeconds: 0 })).status, 400);
  assert.equal((await request("POST", base, { ...intent, audienceVersion: "b".repeat(64) })).status, 409);
  t.mock.timers.tick(120_000);
  assert.equal((await request("POST", base, intent)).status, 409);
  const fresh = await confirmation();
  const started = await request("POST", base, fresh);
  assert.equal(started.status, 201);
  const active = await started.json();
  assert.equal((await request("DELETE", base, { sharingSessionId: active.sharingSessionId })).status, 200);
  assert.equal((await request("POST", base, { ...fresh, takeover: true })).status, 409);
  assert.equal(store.sessions.size, 0);
});

scenario("another tab's consent supersedes prior confirmation without silently starting", async () => {
  const old = await confirmation();
  const latest = await confirmation();
  assert.equal((await request("POST", base, old)).status, 409);
  assert.equal((await request("POST", base, latest)).status, 201);
});

scenario("sender capability is bound to its user, login session and trip", async () => {
  const active = await start();
  for (const [path, user, device] of [[base, "viewer", "a"], [base, "owner", "b"], [otherBase, "owner", "a"]]) {
    assert.equal((await request("PUT", path, position(active.sharingSessionId), user, device)).status, 409);
    assert.equal((await request("DELETE", path, { sharingSessionId: active.sharingSessionId }, user, device)).status, 409);
  }
  assert.equal((await request("PUT", base, position(active.sharingSessionId))).status, 200);
});

scenario("one sender per account across trips and devices with explicit takeover", async () => {
  const original = await start();
  const intent = await confirmation(otherBase, "owner", "b");
  assert.equal((await request("POST", otherBase, intent, "owner", "b")).status, 409);
  const replacement = await request("POST", otherBase, { ...intent, takeover: true }, "owner", "b");
  assert.equal(replacement.status, 201);
  assert.equal(store.sessions.size, 1);
  assert.equal((await request("PUT", base, position(original.sharingSessionId))).status, 409);
  assert.equal((await request("DELETE", base, { sharingSessionId: original.sharingSessionId })).status, 409);
  assert.equal((await (await request("GET")).json()).locations.length, 0);
});

scenario("coordinate expiry is enforced during reads with no cleanup timer", async (t) => {
  const active = await start();
  await request("PUT", base, position(active.sharingSessionId));
  t.mock.timers.tick(59_999);
  assert.equal((await (await request("GET", base, undefined, "viewer")).json()).locations.length, 1);
  t.mock.timers.tick(1);
  assert.equal((await (await request("GET", base, undefined, "viewer")).json()).locations.length, 0);
  assert.equal(store.sessions.get("owner")?.position, undefined);
  // Fresh data can resume within the original, unextended consent duration.
  assert.equal((await request("PUT", base, position(active.sharingSessionId))).status, 200);
  assert.equal(store.sessions.get("owner")?.expiresAt, active.expiresAt);
});

scenario("finite duration expires irrevocably and bounds position lifetime", async (t) => {
  const active = await start(base, "owner", "a", { durationSeconds: 900 });
  t.mock.timers.tick(899_000);
  const response = await request("PUT", base, position(active.sharingSessionId));
  assert.equal((await response.json()).expiresAt, active.expiresAt);
  t.mock.timers.tick(1_000);
  assert.equal((await request("PUT", base, position(active.sharingSessionId))).status, 409);
  assert.equal((await (await request("GET")).json()).ownSharing, null);
  const longest = await start(base, "owner", "a", { durationSeconds: 14400 });
  assert.equal(longest.expiresAt - Date.now(), 14_400_000);
});

scenario("login expiry also bounds sender and client-visible coordinate deadlines", async (t) => {
  const expiry = Date.now() + 5_000;
  await db.run("UPDATE sessions SET expires_at = ? WHERE user_id = ?", [new Date(expiry).toISOString(), "owner"]);
  const active = await start();
  assert.equal(active.expiresAt, expiry);
  assert.equal((await (await request("PUT", base, position(active.sharingSessionId))).json()).expiresAt, expiry);
  t.mock.timers.tick(5_000);
  assert.equal((await (await request("GET", base, undefined, "viewer")).json()).locations.length, 0);
  assert.equal((await request("PUT", base, position(active.sharingSessionId))).status, 401);
});

scenario("shortening an existing login session shortens the next delivered coordinate deadline", async (t) => {
  const active = await start();
  await request("PUT", base, position(active.sharingSessionId));
  const expiry = Date.now() + 5_000;
  await db.run("UPDATE sessions SET expires_at = ? WHERE user_id = ?", [new Date(expiry).toISOString(), "owner"]);
  const data = await (await request("GET", base, undefined, "viewer")).json();
  assert.equal(data.locations[0].expiresAt, expiry);
  assert.equal(data.locations[0].sharingExpiresAt, expiry);
  t.mock.timers.tick(5_000);
  assert.equal((await (await request("GET", base, undefined, "viewer")).json()).locations.length, 0);
});

scenario("timestamps, coordinate bounds and update frequency are server validated", async (t) => {
  const active = await start();
  for (const extra of [{ lat: -91 }, { lng: 181 }, { accuracy: -1 }, { accuracy: 100_001 },
    { measuredAt: Date.now() - 30_001 }, { measuredAt: Date.now() + 5_001 }, { measuredAt: 1.5 }]) {
    assert.equal((await request("PUT", base, position(active.sharingSessionId, extra))).status, 400);
  }
  const first = Date.now();
  assert.equal((await request("PUT", base, position(active.sharingSessionId))).status, 200);
  t.mock.timers.tick(1);
  assert.equal((await request("PUT", base, position(active.sharingSessionId))).status, 429);
  t.mock.timers.tick(2_000);
  assert.equal((await request("PUT", base, position(active.sharingSessionId, { measuredAt: first }))).status, 400);
  assert.equal((await request("PUT", base, position(active.sharingSessionId))).status, 200);
});

scenario("rate limits bound polling and mutations without blocking stop", async () => {
  const active = await start();
  let limited = false;
  for (let count = 0; count < 125; count++) {
    const response = await request("GET");
    if (response.status === 429) { limited = true; assert.equal(response.headers.get("retry-after"), "60"); break; }
  }
  assert.equal(limited, true);
  for (let count = 0; count < 65; count++) await request("PUT", base, position(active.sharingSessionId));
  assert.equal((await request("DELETE", base, { sharingSessionId: active.sharingSessionId })).status, 200);
});

scenario("membership add and removal revoke every sender and pending consent in that trip", async () => {
  const first = await start();
  const second = await start(base, "viewer");
  const intent = await confirmation();
  const invitation = await request("POST", "/api/trips/trip-one/invite", { email: "outsider@example.test" });
  assert.equal(invitation.status, 201);
  assert.equal(store.sessions.size, 0);
  assert.equal((await request("POST", base, intent)).status, 409);
  assert.equal((await request("PUT", base, position(first.sharingSessionId))).status, 409);
  assert.equal((await request("PUT", base, position(second.sharingSessionId), "viewer")).status, 409);
  const next = await start();
  assert.equal((await request("DELETE", "/api/trips/trip-one/members/viewer")).status, 200);
  assert.equal((await request("GET", base, undefined, "viewer")).status, 404);
  assert.equal((await request("PUT", base, position(next.sharingSessionId))).status, 409);
});

scenario("logout deletes latest coordinates and pending consent and rejects old browser sessions", async () => {
  const active = await start();
  await request("PUT", base, position(active.sharingSessionId));
  const intent = await confirmation();
  assert.equal((await request("POST", "/auth/logout", {})).status, 200);
  assert.equal(store.sessions.size, 0);
  assert.equal(store.consents.size, 0);
  assert.equal((await request("PUT", base, position(active.sharingSessionId))).status, 401);
  assert.equal((await request("POST", base, intent)).status, 401);
  assert.equal((await (await request("GET", base, undefined, "viewer")).json()).locations.length, 0);
});

scenario("account removal and approval changes revoke the affected trip's consent", async () => {
  const owner = await start();
  await start(base, "viewer");
  assert.equal((await request("DELETE", "/api/admin/users/viewer", undefined, "admin")).status, 200);
  assert.equal(store.sessions.size, 0);
  assert.equal((await request("GET", base, undefined, "viewer")).status, 401);
  assert.equal((await request("PUT", base, position(owner.sharingSessionId))).status, 409);
  await start();
  await setUserStatus("owner", "pending");
  assert.equal(store.sessions.size, 0);
  assert.equal((await request("GET")).status, 403);
});

scenario("trip deletion revokes sharing and consent", async () => {
  await start();
  await confirmation();
  assert.equal((await request("DELETE", "/api/trips/trip-one")).status, 200);
  assert.equal(store.sessions.size, 0);
  assert.equal(store.consents.size, 0);
  assert.equal((await request("GET")).status, 404);
});

scenario("expired auth sessions and out-of-band member changes are rechecked on reads", async () => {
  const active = await start();
  await request("PUT", base, position(active.sharingSessionId));
  await db.run("UPDATE sessions SET expires_at = ? WHERE user_id = ?", [new Date(Date.now() - 1).toISOString(), "owner"]);
  assert.equal((await (await request("GET", base, undefined, "viewer")).json()).locations.length, 0);
  const viewer = await start(base, "viewer");
  await db.run("DELETE FROM trip_members WHERE user_id = ?", ["owner"]);
  assert.equal((await request("PUT", base, position(viewer.sharingSessionId), "viewer")).status, 409);
});

scenario("late request bodies cannot resurrect sharing after stop or logout", async () => {
  const active = await start();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const inFlight = app.request(new Request(`${origin}${base}`, {
    method: "PUT", headers: headers(), body: stream, duplex: "half",
  } as RequestInit));
  assert.equal((await request("DELETE", base, { sharingSessionId: active.sharingSessionId })).status, 200);
  controller.enqueue(new TextEncoder().encode(JSON.stringify(position(active.sharingSessionId))));
  controller.close();
  assert.equal((await inFlight).status, 409);
  assert.equal(store.sessions.size, 0);
  const intent = await confirmation();
  let startController!: ReadableStreamDefaultController<Uint8Array>;
  const delayedStart = app.request(new Request(`${origin}${base}`, {
    method: "POST", headers: headers(), body: new ReadableStream<Uint8Array>({ start(value) { startController = value; } }), duplex: "half",
  } as RequestInit));
  await request("POST", "/auth/logout", {});
  startController.enqueue(new TextEncoder().encode(JSON.stringify(intent)));
  startController.close();
  assert.equal((await delayedStart).status, 401);
  assert.equal(store.sessions.size, 0);
});

scenario("concurrent confirmed starts cannot create multiple senders", async () => {
  const intent = await confirmation();
  const results = await Promise.all([request("POST", base, intent), request("POST", base, intent)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  assert.equal(store.sessions.size, 1);
  await removeMember("trip-one", "viewer");
  assert.equal(store.sessions.size, 0);
});

scenario("positions never change persistent database content or trip exports", async () => {
  const before = await db.all("SELECT * FROM trips");
  const active = await start();
  await request("PUT", base, position(active.sharingSessionId));
  assert.deepEqual(await db.all("SELECT * FROM trips"), before);
  const tables = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
  assert.deepEqual(tables.map((row) => row.name).sort(), ["legs", "places", "sessions", "trip_members", "trips", "users"]);
  const exported = await (await request("GET", "/api/trips/trip-one")).json();
  assert.equal(JSON.stringify(exported).includes("37.5"), false);
});

scenario("unexpected location errors do not reflect or log request-sensitive details", async (t) => {
  const logging = t.mock.method(console, "error", () => {});
  const original = db.all;
  db.all = async () => { throw new Error("synthetic private position detail"); };
  try {
    const response = await request("GET");
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "location sharing request failed" });
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal(logging.mock.callCount(), 0);
  } finally {
    db.all = original;
  }
});
