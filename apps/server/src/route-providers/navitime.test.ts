import assert from "node:assert/strict";
import test from "node:test";
import { encodeLineStringToPolyline } from "./polylineEncoding.js";
import { fetchNavitimeRoutes } from "./navitime.js";

// Fixture shape verified against a live account (2026-09-05, Osaka Station ->
// Namba Station): sections alternate "point" and "move" entries, a "move"
// section carries the vehicle kind, line name, and scheduled span. The one
// surprise the spec doc (https://api-sdk.navitime.co.jp/api/specs/api_guide/route_transit.html)
// didn't show: the journey totals live under `summary.move`, not `summary`
// itself - the original synthetic fixture had them a level too shallow and
// every real response silently reported null duration/distance/fare.
const ROUTE_TRANSIT_FIXTURE = {
  items: [
    {
      summary: { move: { time: 22, distance: 4200, fare: { unit_0: 240 } } },
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

// shape_transit's real response is a bare GeoJSON FeatureCollection, not
// `{ shapes: { features: [...] } }` - also caught only by testing against a
// live account, since the spec doc's own example is nested that way. Each
// feature's `properties.ways` ("walk" or "transport") is only present at all
// when the request carries `options=transport_shape` - without it every
// feature, including the real train ride, comes back "walk".
const SHAPE_TRANSIT_FIXTURE = {
  type: "FeatureCollection",
  features: [
    { geometry: { type: "LineString", coordinates: [[135.4959, 34.7025], [135.499, 34.701]] }, properties: { ways: "walk" } },
    { geometry: { type: "LineString", coordinates: [[135.499, 34.701], [135.5, 34.7]] }, properties: { ways: "transport" } },
    { geometry: { type: "LineString", coordinates: [[135.5, 34.7], [135.5091, 34.6929]] }, properties: { ways: "walk" } },
  ],
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

    // The three shape_transit LineString features are concatenated and
    // re-encoded in Google's polyline format, so the client never needs to
    // know which provider answered.
    assert.equal(
      route.polyline,
      encodeLineStringToPolyline([
        [135.4959, 34.7025],
        [135.499, 34.701],
        [135.499, 34.701],
        [135.5, 34.7],
        [135.5, 34.7],
        [135.5091, 34.6929],
      ]),
    );

    // Each feature draws as its own segment - walk, ride, walk - so the map
    // can colour the ride differently from the walk to/from the station,
    // same as a Google-sourced route.
    assert.deepEqual(
      route.segments?.map((segment) => segment.travelMode),
      ["WALK", "TRANSIT", "WALK"],
    );
    assert.equal(route.segments?.[1].polyline, encodeLineStringToPolyline([[135.499, 34.701], [135.5, 34.7]]));

    // Geometry never participates in the journey's identity - same rule as
    // the Google provider.
    assert.equal(typeof route.key, "string");
  } finally {
    restore();
  }
});

test("the shape request asks for transport_shape, or every feature comes back mislabelled walk", async () => {
  const seenUrls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seenUrls.push(url);
    const body = url.includes("/shape_transit") ? SHAPE_TRANSIT_FIXTURE : ROUTE_TRANSIT_FIXTURE;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    await fetchNavitimeRoutes("test-key", "navitime-route-totalnavi.p.rapidapi.com", FROM, TO, {});
    const shapeUrl = seenUrls.find((url) => url.includes("/shape_transit"));
    assert.equal(new URL(shapeUrl!).searchParams.get("options"), "transport_shape");
  } finally {
    globalThis.fetch = original;
  }
});

test("every alternative gets its own geometry, not just the recommended one", async () => {
  // Unlike Google (one call returns every alternative's geometry already),
  // shape_transit answers for exactly one route number at a time. Selecting
  // an alternative used to fall back to a straight line because only route 1
  // ever had a polyline or segments at all.
  const twoItems = {
    items: [
      { summary: { move: { time: 22, distance: 4200 } }, sections: [] },
      { summary: { move: { time: 25, distance: 4600 } }, sections: [] },
    ],
  };
  const seenNos: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (!url.pathname.includes("/shape_transit")) {
      return new Response(JSON.stringify(twoItems), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const no = url.searchParams.get("no")!;
    seenNos.push(no);
    // A distinct feature per route number, so each alternative's polyline is
    // provably its own rather than one shared fetch reused for every index.
    const body = {
      type: "FeatureCollection",
      features: [{ geometry: { type: "LineString", coordinates: [[135, Number(no)]] }, properties: { ways: "walk" } }],
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await fetchNavitimeRoutes("test-key", "navitime-route-totalnavi.p.rapidapi.com", FROM, TO, {});
    assert.deepEqual(seenNos.sort(), ["1", "2"]);
    assert.equal(result.routes.length, 2);
    assert.ok(result.routes[0].polyline);
    assert.ok(result.routes[1].polyline);
    assert.notEqual(result.routes[0].polyline, result.routes[1].polyline);
    assert.equal(result.routes[1].label, "DEFAULT_ROUTE_ALTERNATE");
  } finally {
    globalThis.fetch = original;
  }
});

test("a walk-only response still fingerprints and reports no vehicles", async () => {
  const walkOnly = {
    items: [
      {
        summary: { move: { time: 8, distance: 600 } },
        sections: [{ type: "point" }, { type: "move", move: "walk", time: 8, distance: 600 }, { type: "point" }],
      },
    ],
  };
  const restore = stubFetch({ routeTransit: walkOnly, shapeTransit: { type: "FeatureCollection", features: [] } });
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

test("the departure/arrival instant is sent in NAVITIME's local datetime format, not raw ISO UTC", async () => {
  const seenUrls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seenUrls.push(url);
    const body = url.includes("/shape_transit") ? SHAPE_TRANSIT_FIXTURE : ROUTE_TRANSIT_FIXTURE;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    // NAVITIME rejected exactly this shape in production: a raw
    // `Date.toISOString()` instant, milliseconds and "Z" included.
    await fetchNavitimeRoutes("test-key", "navitime-route-totalnavi.p.rapidapi.com", FROM, TO, {
      departureTime: "2026-09-05T13:21:41.254Z",
    });
    const departureUrl = seenUrls.find((url) => url.includes("/route_transit"));
    // 13:21 UTC is 22:21 JST the same day - no "Z", no milliseconds, no
    // offset suffix, and shifted nine hours ahead rather than left as UTC.
    assert.equal(new URL(departureUrl!).searchParams.get("start_time"), "2026-09-05T22:21:41");

    seenUrls.length = 0;
    // A departure late enough in the UTC day to roll over into the next
    // Japan-local calendar date must roll the date, not just the hour.
    await fetchNavitimeRoutes("test-key", "navitime-route-totalnavi.p.rapidapi.com", FROM, TO, {
      arrivalTime: "2026-09-05T20:00:00.000Z",
    });
    const arrivalUrl = seenUrls.find((url) => url.includes("/route_transit"));
    assert.equal(new URL(arrivalUrl!).searchParams.get("goal_time"), "2026-09-06T05:00:00");
    assert.equal(new URL(arrivalUrl!).searchParams.has("start_time"), false);
  } finally {
    globalThis.fetch = original;
  }
});

test("no items at all is treated as no route, same as the Google provider", async () => {
  const restore = stubFetch({ routeTransit: { items: [] }, shapeTransit: { type: "FeatureCollection", features: [] } });
  try {
    await assert.rejects(
      fetchNavitimeRoutes("test-key", "navitime-route-totalnavi.p.rapidapi.com", FROM, TO, {}),
      /NAVITIME returned no routes/,
    );
  } finally {
    restore();
  }
});
