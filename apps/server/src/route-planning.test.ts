import assert from "node:assert/strict";
import test from "node:test";
import {
  bucketFor,
  cacheKey,
  resolveTiming,
  ROUTE_GEOMETRY_VERSION,
  RouteRequestError,
  routeFingerprint,
  routeSegments,
  transitSchedule,
  transitRouteDetails,
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
    provider: "google" as const,
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
  // A Google-served cache row and a NAVITIME-served one must never share a
  // slot - they can answer the same (from, to, mode) with different journeys.
  assert.notEqual(key, cacheKey({ ...base, provider: "navitime" }));
  // Same inputs must be stable across calls, or nothing would ever cache-hit.
  assert.equal(key, cacheKey({ ...base }));
  // The geometry/schema version participates, so old entries cannot be read.
  // Asserted against the exported constant rather than a copy of its value,
  // so bumping the version stays a one-line change.
  assert.ok(key.includes(ROUTE_GEOMETRY_VERSION));
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

test("two departures on the same transit line are different journeys", () => {
  // The 10:00 and the 10:30 bus share a polyline, a duration, and a distance.
  // Only the schedule separates them, so without it a saved second departure
  // would snap back to whichever the provider happened to list first.
  const shape = { polyline: "abc", durationS: 600, distanceM: 1200 };
  const first = { ...shape, departureTime: "2026-09-07T10:00:00Z", arrivalTime: "2026-09-07T10:10:00Z" };
  const second = { ...shape, departureTime: "2026-09-07T10:30:00Z", arrivalTime: "2026-09-07T10:40:00Z" };

  assert.notEqual(routeFingerprint(first), routeFingerprint(second));
  assert.equal(routeFingerprint(first), routeFingerprint({ ...first }));

  // A mode that carries no schedule still fingerprints on shape alone, and an
  // absent schedule must not read differently from an explicitly null one.
  assert.equal(routeFingerprint(shape), routeFingerprint({ ...shape, departureTime: null, arrivalTime: null }));
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

test("segments preserve the order the journey is actually travelled", () => {
  const segments = routeSegments([
    { steps: [{ travelMode: "WALK", polyline: { encodedPolyline: "a" } }] },
    {
      steps: [
        { travelMode: "TRANSIT", polyline: { encodedPolyline: "b" } },
        { travelMode: "WALK", polyline: { encodedPolyline: "c" } },
      ],
    },
  ]);
  assert.deepEqual(segments, [
    { travelMode: "WALK", polyline: "a" },
    { travelMode: "TRANSIT", polyline: "b" },
    { travelMode: "WALK", polyline: "c" },
  ]);
});

test("a step with no geometry is dropped rather than drawn as a gap", () => {
  const segments = routeSegments([
    { steps: [{ travelMode: "WALK" }, { travelMode: "TRANSIT", polyline: { encodedPolyline: "b" } }] },
  ]);
  assert.deepEqual(segments, [{ travelMode: "TRANSIT", polyline: "b" }]);
});

test("an unfamiliar travel mode is recorded rather than guessed at", () => {
  // Bicycle and two-wheeler legs reach this through imports. Recording them as
  // OTHER keeps the drawing decision in one place instead of spreading a
  // provider enum through the client.
  const segments = routeSegments([{ steps: [{ travelMode: "BICYCLE", polyline: { encodedPolyline: "a" } }] }]);
  assert.deepEqual(segments, [{ travelMode: "OTHER", polyline: "a" }]);
});

test("no usable steps yields null, not an empty list", () => {
  // null lets the client treat "not requested" and "provider sent none" the
  // same way: draw the whole-journey line.
  assert.equal(routeSegments(undefined), null);
  assert.equal(routeSegments([]), null);
  assert.equal(routeSegments([{ steps: [] }]), null);
  assert.equal(routeSegments([{ steps: [{ travelMode: "WALK" }] }]), null);
});

test("adding segments does not disturb a route's fingerprint", () => {
  // The fingerprint is the identity every saved itinerary stores. If step
  // geometry ever leaked into it, every user's chosen alternative would
  // silently reset to the recommended one with nothing reported.
  const summary = {
    polyline: "abc",
    durationS: 600,
    distanceM: 1200,
    departureTime: "2026-09-07T10:00:00Z",
    arrivalTime: "2026-09-07T10:10:00Z",
  };
  const before = routeFingerprint(summary);
  const withSegments = { ...summary, segments: routeSegments([{ steps: [{ travelMode: "WALK", polyline: { encodedPolyline: "x" } }] }]) };
  assert.equal(routeFingerprint(withSegments), before);
});

test("the transit schedule still spans the first departure to the last arrival", () => {
  const schedule = transitSchedule([
    { steps: [{ transitDetails: { stopDetails: { departureTime: "2026-09-07T10:30:00Z", arrivalTime: "2026-09-07T10:50:00Z" } } }] },
    { steps: [{ transitDetails: { stopDetails: { departureTime: "2026-09-07T10:00:00Z", arrivalTime: "2026-09-07T10:20:00Z" } } }] },
  ]);
  assert.deepEqual(schedule, { departureTime: "2026-09-07T10:00:00Z", arrivalTime: "2026-09-07T10:50:00Z" });
});

test("a journey with no scheduled leg reports no schedule", () => {
  assert.deepEqual(transitSchedule([{ steps: [{ travelMode: "WALK" }] }]), {
    departureTime: null,
    arrivalTime: null,
  });
});

test("transit route details keep the boarded vehicle, line, and direction", () => {
  const details = transitRouteDetails([
    {
      steps: [
        { travelMode: "WALK" },
        {
          travelMode: "TRANSIT",
          transitDetails: {
            transitLine: { nameShort: "Sakaisuji Line", vehicle: { type: "SUBWAY" } },
            headsign: "Tenjinbashisuji 6-chome",
          },
        },
        {
          travelMode: "TRANSIT",
          transitDetails: {
            transitLine: { nameShort: "Sakaisuji Line", vehicle: { type: "SUBWAY" } },
            headsign: "Tenjinbashisuji 6-chome",
          },
        },
        {
          travelMode: "TRANSIT",
          transitDetails: {
            transitLine: { name: "Osaka City Bus 62", vehicle: { type: "BUS" } },
            headsign: "Osaka Station",
          },
        },
      ],
    },
  ]);

  assert.deepEqual(details, [
    { vehicle: "SUBWAY", line: "Sakaisuji Line", headsign: "Tenjinbashisuji 6-chome" },
    { vehicle: "BUS", line: "Osaka City Bus 62", headsign: "Osaka Station" },
  ]);
});
