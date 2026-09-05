import assert from "node:assert/strict";
import test from "node:test";
import { encodeLineStringToPolyline } from "./polylineEncoding.js";
import { fetchNavitimeRoutes } from "./navitime.js";

// Synthetic fixture modeled on the NAVITIME API 2.0 route_transit / shape_transit
// specification (https://api-sdk.navitime.co.jp/api/specs/api_guide/route_transit.html):
// sections alternate "point" and "move" entries, a "move" section carries the
// vehicle kind, line name, and scheduled span. Not exercised against a real
// account - see the plan's "검증의 한계" note. Verify against a live response
// once NAVITIME_API_KEY is provisioned.
const ROUTE_TRANSIT_FIXTURE = {
  items: [
    {
      summary: { time: 22, distance: 4200, fare: { unit_0: 240 } },
      sections: [
        { type: "point" },
        { type: "move", move: "walk", time: 5, distance: 400 },
        {
          type: "move",
          move: "subway",
          line_name: "Sakaisuji Line",
          from_time: "2026-09-08T10:05:00+09:00",
          to_time: "2026-09-08T10:15:00+09:00",
        },
        { type: "point" },
        {
          type: "move",
          move: "bus",
          line_name: "Osaka City Bus 62",
          from_time: "2026-09-08T10:18:00+09:00",
          to_time: "2026-09-08T10:24:00+09:00",
        },
        { type: "point" },
        { type: "move", move: "walk", time: 3, distance: 250 },
        { type: "point" },
      ],
    },
  ],
};

const SHAPE_TRANSIT_FIXTURE = {
  shapes: {
    features: [
      { geometry: { type: "LineString", coordinates: [[135.4959, 34.7025], [135.5, 34.7]] } },
      { geometry: { type: "LineString", coordinates: [[135.5, 34.7], [135.5091, 34.6929]] } },
    ],
  },
};

function stubFetch(responses: { routeTransit: unknown; shapeTransit: unknown }) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/shape_transit") ? responses.shapeTransit : responses.routeTransit;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const FROM = { latLng: { latitude: 34.7025, longitude: 135.4959 } };
const TO = { latLng: { latitude: 34.6929, longitude: 135.5091 } };

test("a NAVITIME route maps onto the provider-neutral shape the client expects", async () => {
  const restore = stubFetch({ routeTransit: ROUTE_TRANSIT_FIXTURE, shapeTransit: SHAPE_TRANSIT_FIXTURE });
  try {
    const result = await fetchNavitimeRoutes("test-key", "navitime-route-totalnavi.p.rapidapi.com", FROM, TO, {
      departureTime: "2026-09-08T01:00:00Z",
    });
    assert.equal(result.routes.length, 1);
    const [route] = result.routes;

    assert.equal(route.durationS, 22 * 60);
    assert.equal(route.distanceM, 4200);
    assert.equal(route.fareAmount, 240);
    assert.equal(route.fareCurrency, "JPY");
    assert.equal(route.label, "DEFAULT_ROUTE");
    assert.equal(route.departureTime, "2026-09-08T10:05:00+09:00");
    assert.equal(route.arrivalTime, "2026-09-08T10:24:00+09:00");

    // Two distinct vehicles boarded, in order - subway then bus, walking
    // access legs excluded, mapped onto the vocabulary TransitVehicleIcon
    // already knows.
    assert.deepEqual(route.transit, [
      { vehicle: "SUBWAY", line: "Sakaisuji Line", headsign: null },
      { vehicle: "BUS", line: "Osaka City Bus 62", headsign: null },
    ]);

    // The two shape_transit LineString features are concatenated and
    // re-encoded in Google's polyline format, so the client never needs to
    // know which provider answered.
    assert.equal(
      route.polyline,
      encodeLineStringToPolyline([
        [135.4959, 34.7025],
        [135.5, 34.7],
        [135.5, 34.7],
        [135.5091, 34.6929],
      ]),
    );

    // Geometry never participates in the journey's identity - same rule as
    // the Google provider.
    assert.equal(typeof route.key, "string");
  } finally {
    restore();
  }
});

test("a walk-only response still fingerprints and reports no vehicles", async () => {
  const walkOnly = {
    items: [
      {
        summary: { time: 8, distance: 600 },
        sections: [{ type: "point" }, { type: "move", move: "walk", time: 8, distance: 600 }, { type: "point" }],
      },
    ],
  };
  const restore = stubFetch({ routeTransit: walkOnly, shapeTransit: { shapes: { features: [] } } });
  try {
    const result = await fetchNavitimeRoutes("test-key", "navitime-route-totalnavi.p.rapidapi.com", FROM, TO, {});
    const [route] = result.routes;
    assert.equal(route.transit, null);
    assert.equal(route.fareAmount, null);
    assert.equal(route.fareCurrency, null);
    assert.equal(route.polyline, null);
  } finally {
    restore();
  }
});

test("no items at all is treated as no route, same as the Google provider", async () => {
  const restore = stubFetch({ routeTransit: { items: [] }, shapeTransit: { shapes: { features: [] } } });
  try {
    await assert.rejects(
      fetchNavitimeRoutes("test-key", "navitime-route-totalnavi.p.rapidapi.com", FROM, TO, {}),
      /NAVITIME returned no routes/,
    );
  } finally {
    restore();
  }
});
