import assert from "node:assert/strict";
import test from "node:test";
import { resolveProvider } from "./registry.js";

const PLACE_ID_ONLY = { placeId: "ChIJ_abc" };
const COORD_ONLY = { latLng: { latitude: 34.7025, longitude: 135.4959 } };
const PLACE_ID_WITH_COORDS = { placeId: "ChIJ_abc", latLng: { latitude: 34.7025, longitude: 135.4959 } };

function withNavitimeKey<T>(key: string | undefined, fn: () => T): T {
  const previous = process.env.NAVITIME_API_KEY;
  if (key == null) delete process.env.NAVITIME_API_KEY;
  else process.env.NAVITIME_API_KEY = key;
  try {
    return fn();
  } finally {
    if (previous == null) delete process.env.NAVITIME_API_KEY;
    else process.env.NAVITIME_API_KEY = previous;
  }
}

test("a placeId endpoint that also carries coordinates still routes to NAVITIME", () => {
  // This is the case that mattered in practice: a search-picked spot has both
  // a placeId and coordinates, and almost every real itinerary stop comes
  // from search rather than a map-dropped pin. Gating on "no placeId" instead
  // of "has coordinates" would have left NAVITIME unreachable for real trips.
  withNavitimeKey("test-key", () => {
    const provider = resolveProvider("TRANSIT", "Asia/Tokyo", { from: PLACE_ID_WITH_COORDS, to: COORD_ONLY });
    assert.equal(provider.id, "navitime");
  });
});

test("a placeId endpoint with no coordinates at all falls back to Google", () => {
  withNavitimeKey("test-key", () => {
    const provider = resolveProvider("TRANSIT", "Asia/Tokyo", { from: PLACE_ID_ONLY, to: COORD_ONLY });
    assert.equal(provider.id, "google");
  });
});

test("NAVITIME is only offered for TRANSIT in Japan, and only once configured", () => {
  withNavitimeKey("test-key", () => {
    assert.equal(resolveProvider("DRIVE", "Asia/Tokyo", { from: COORD_ONLY, to: COORD_ONLY }).id, "google");
    assert.equal(resolveProvider("TRANSIT", "Asia/Seoul", { from: COORD_ONLY, to: COORD_ONLY }).id, "google");
  });
  withNavitimeKey(undefined, () => {
    assert.equal(resolveProvider("TRANSIT", "Asia/Tokyo", { from: COORD_ONLY, to: COORD_ONLY }).id, "google");
  });
});
