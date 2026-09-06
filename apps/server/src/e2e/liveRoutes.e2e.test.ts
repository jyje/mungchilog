// Live, non-mocked coverage against the real Google Routes API - the two
// example journeys the user asked for, run against src/route-providers/google.ts's
// actual fetch/parse logic (not a reimplementation). Not part of `npm test` /
// CI: this hits a real network endpoint, consumes real quota, and needs a
// provisioned GOOGLE_MAPS_SERVER_API_KEY.
//
// Run manually with:
//   npm run test:e2e
import assert from "node:assert/strict";
import test from "node:test";
import { fetchGoogleRoutes } from "../route-providers/google.js";

const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

// A fixed 09:00 departure on the next Monday, in whatever timezone the
// caller means it in - Seoul and Osaka are both UTC+9 with no DST, so one
// UTC instant (00:00Z) reads as 09:00 local in either city.
function nextMonday9amUtcPlus9(): string {
  const now = new Date();
  const daysUntilMonday = ((1 - now.getUTCDay() + 7) % 7) || 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday));
  monday.setUTCHours(0, 0, 0, 0); // 00:00Z = 09:00 in UTC+9
  return monday.toISOString();
}

const DEPARTURE = nextMonday9amUtcPlus9();

test("Seoul Station -> COEX: a real transit journey exists and is returned as one", { skip: !apiKey }, async () => {
  const result = await fetchGoogleRoutes(
    apiKey!,
    { latLng: { latitude: 37.5547, longitude: 126.9707 } },
    { latLng: { latitude: 37.5115, longitude: 127.0595 } },
    "TRANSIT",
    { departureTime: DEPARTURE },
    true,
    false,
  );

  assert.ok(result.routes.length >= 1, "expected at least one route");
  const [primary] = result.routes;
  assert.notEqual(primary.transit, null, "Seoul Station -> COEX must include a real transit vehicle, not a walk substitute");
  assert.ok(primary.durationS != null && primary.durationS > 15 * 60 && primary.durationS < 90 * 60, `duration out of expected range: ${primary.durationS}s`);
  assert.ok(primary.distanceM != null && primary.distanceM > 5_000 && primary.distanceM < 25_000, `distance out of expected range: ${primary.distanceM}m`);
});

test(
  "Hankyu Umeda Main Store -> Kitahama Retro Building: Google must not silently substitute a walk for transit",
  { skip: !apiKey },
  async () => {
    // Confirmed live (see the plan and the commit that added the
    // isViableTransitRoute filter): this corridor gets HTTP 200 with a
    // route made entirely of WALK steps when TRANSIT is requested, despite
    // real subway/train options existing between these two points. The
    // filter added to route-providers/google.ts must turn that into the
    // same "no routes" failure the empty-response case already produces.
    //
    // Written so it stays correct even if Google's Japan transit coverage
    // improves later: either this throws, or - if Google has started
    // returning a genuine journey - every returned route must include a
    // real transit vehicle. What must never happen is a walk quietly
    // presented as transit.
    const from = { latLng: { latitude: 34.7025, longitude: 135.4959 } };
    const to = { latLng: { latitude: 34.6929, longitude: 135.5091 } };

    try {
      const result = await fetchGoogleRoutes(apiKey!, from, to, "TRANSIT", { departureTime: DEPARTURE }, true, false);
      for (const route of result.routes) {
        assert.notEqual(route.transit, null, "a route returned as TRANSIT must contain a real transit vehicle, never a walk substitute");
      }
    } catch (e) {
      assert.match((e as Error).message, /Routes API returned no routes/);
    }
  },
);
