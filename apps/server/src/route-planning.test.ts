import assert from "node:assert/strict";
import test from "node:test";
import {
  bucketFor,
  cacheKey,
  resolveTiming,
  RouteRequestError,
  routeFingerprint,
  toRoutesApiWaypoint,
  WaypointSchema,
  waypointRef,
} from "./route-planning.js";

test("waypoints accept a place id or a bounded coordinate pair", () => {
  assert.equal(WaypointSchema.safeParse({ placeId: "ChIJ_abc" }).success, true);
  assert.equal(WaypointSchema.safeParse({ latLng: { latitude: 35.68, longitude: 139.76 } }).success, true);
  // Valid zero coordinates must survive: null island is a legitimate point.
  assert.equal(WaypointSchema.safeParse({ latLng: { latitude: 0, longitude: 0 } }).success, true);

  assert.equal(WaypointSchema.safeParse({ placeId: "" }).success, false);
  assert.equal(WaypointSchema.safeParse({ latLng: { latitude: 91, longitude: 0 } }).success, false);
  assert.equal(WaypointSchema.safeParse({ latLng: { latitude: 0, longitude: 181 } }).success, false);
  assert.equal(WaypointSchema.safeParse({ latLng: { latitude: 35.68 } }).success, false);
});

test("waypoint refs distinguish endpoint kinds and normalize coordinate precision", () => {
  assert.equal(waypointRef({ placeId: "ChIJ_abc" }), "place:ChIJ_abc");
  assert.equal(waypointRef({ latLng: { latitude: 35.1, longitude: 139.2 } }), "ll:35.100000,139.200000");
  // The same point written with different precision must hit one cache slot.
  assert.equal(
    waypointRef({ latLng: { latitude: 35.1, longitude: 139.2 } }),
    waypointRef({ latLng: { latitude: 35.1000004, longitude: 139.2000001 } }),
  );
  // A place id and a coordinate can never collide into the same ref.
  assert.notEqual(waypointRef({ placeId: "35.1,139.2" }), waypointRef({ latLng: { latitude: 35.1, longitude: 139.2 } }));
});

test("waypoints serialize to the shapes the Routes API documents", () => {
  assert.deepEqual(toRoutesApiWaypoint({ placeId: "ChIJ_abc" }), { placeId: "ChIJ_abc" });
  assert.deepEqual(toRoutesApiWaypoint({ latLng: { latitude: 35.68, longitude: 139.76 } }), {
    location: { latLng: { latitude: 35.68, longitude: 139.76 } },
  });
});

test("cache buckets follow the trip timezone, not the server's", () => {
  // 2026-01-05T23:30Z is Monday evening in London but Tuesday morning in Tokyo.
  const when = new Date("2026-01-05T23:30:00Z");
  assert.equal(bucketFor(when, "Europe/London"), "Mon-5");
  assert.equal(bucketFor(when, "Asia/Tokyo"), "Tue-2");
});

test("cache keys separate every input that can change the returned route", () => {
  const base = {
    fromRef: "place:A",
    toRef: "place:B",
    mode: "TRANSIT" as const,
    bucket: "Mon-2",
    timingKind: "AUTO" as const,
    alternatives: true,
    trafficAware: false,
  };
  const key = cacheKey(base);

  assert.notEqual(key, cacheKey({ ...base, toRef: "ll:35.100000,139.200000" }));
  assert.notEqual(key, cacheKey({ ...base, mode: "WALK" }));
  assert.notEqual(key, cacheKey({ ...base, bucket: "Mon-3" }));
  assert.notEqual(key, cacheKey({ ...base, alternatives: false }));
  assert.notEqual(key, cacheKey({ ...base, trafficAware: true }));
  // A user-chosen departure must not read a bucket filled by a derived one.
  assert.notEqual(key, cacheKey({ ...base, timingKind: "DEPART_AT" }));
  assert.notEqual(key, cacheKey({ ...base, timingKind: "ARRIVE_BY" }));
  // Same inputs must be stable across calls, or nothing would ever cache-hit.
  assert.equal(key, cacheKey({ ...base }));
  // The geometry/schema version participates, so old entries cannot be read.
  assert.ok(key.includes("endpoints-timing-v2"));
});

test("route fingerprints identify a journey rather than its position in the list", () => {
  const route = { polyline: "abc", durationS: 600, distanceM: 1200 };
  assert.equal(routeFingerprint(route), routeFingerprint({ ...route }));
  assert.notEqual(routeFingerprint(route), routeFingerprint({ ...route, polyline: "abd" }));
  assert.notEqual(routeFingerprint(route), routeFingerprint({ ...route, durationS: 601 }));
  // Missing fields must still fingerprint rather than throw.
  assert.equal(typeof routeFingerprint({ polyline: null, durationS: null, distanceM: null }), "string");
  // A null polyline and an empty one are the same absence, not two routes.
  assert.equal(
    routeFingerprint({ polyline: null, durationS: 1, distanceM: 2 }),
    routeFingerprint({ polyline: "", durationS: 1, distanceM: 2 }),
  );
});

test("transit is the only mode that may arrive by a deadline", () => {
  const when = new Date("2026-01-05T23:30:00Z");
  assert.deepEqual(resolveTiming({ mode: "TRANSIT", timingKind: "ARRIVE_BY", when, trafficAware: false }), {
    arrivalTime: "2026-01-05T23:30:00.000Z",
  });
  for (const mode of ["DRIVE", "WALK"] as const) {
    assert.throws(
      () => resolveTiming({ mode, timingKind: "ARRIVE_BY", when, trafficAware: false }),
      RouteRequestError,
    );
  }
});

test("departure time is sent only where it changes the answer", () => {
  const when = new Date("2026-01-05T23:30:00Z");
  const departure = { departureTime: "2026-01-05T23:30:00.000Z" };

  assert.deepEqual(resolveTiming({ mode: "TRANSIT", timingKind: "AUTO", when, trafficAware: false }), departure);
  assert.deepEqual(resolveTiming({ mode: "DRIVE", timingKind: "DEPART_AT", when, trafficAware: true }), departure);
  // A plain walk or an untimed drive gains nothing from a departure stamp, and
  // omitting it lets more trips share one cache entry.
  assert.deepEqual(resolveTiming({ mode: "WALK", timingKind: "DEPART_AT", when, trafficAware: false }), {});
  assert.deepEqual(resolveTiming({ mode: "DRIVE", timingKind: "AUTO", when, trafficAware: false }), {});
});

test("timing never yields both a departure and an arrival", () => {
  const when = new Date("2026-01-05T23:30:00Z");
  for (const timingKind of ["AUTO", "DEPART_AT", "ARRIVE_BY"] as const) {
    const timing = resolveTiming({ mode: "TRANSIT", timingKind, when, trafficAware: false });
    assert.ok(!("departureTime" in timing && "arrivalTime" in timing));
  }
});
