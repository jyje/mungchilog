import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlaceDetails, parseCachedPlaceDetails, PLACE_DETAILS_FIELD_MASK } from "./routes/places.js";

test("place details field mask is explicit and excludes review and photo payloads", () => {
  const fields = PLACE_DETAILS_FIELD_MASK.split(",");
  assert.ok(fields.includes("displayName"));
  assert.ok(fields.includes("regularOpeningHours"));
  assert.equal(fields.some((field) => field.includes("reviews")), false);
  assert.equal(fields.some((field) => field.includes("photos")), false);
});

test("place details normalization keeps only finite typed fields", () => {
  assert.deepEqual(normalizePlaceDetails("fallback-id", {
    id: "place-1",
    displayName: { text: "도쿄역" },
    formattedAddress: "1 Chome Marunouchi",
    location: { latitude: 35.6812, longitude: 139.7671 },
    primaryTypeDisplayName: { text: "기차역" },
    rating: 4.4,
    userRatingCount: 1234,
    websiteUri: "https://example.com",
    ignored: { raw: true },
  }), {
    id: "place-1",
    displayName: "도쿄역",
    formattedAddress: "1 Chome Marunouchi",
    location: { latitude: 35.6812, longitude: 139.7671 },
    category: "기차역",
    rating: 4.4,
    userRatingCount: 1234,
    regularOpeningHours: null,
    websiteUri: "https://example.com",
    nationalPhoneNumber: null,
    googleMapsUri: null,
  });
});

test("cached place details reject malformed and identity-free payloads", () => {
  assert.equal(parseCachedPlaceDetails("not-json"), null);
  assert.equal(parseCachedPlaceDetails("[]"), null);
  assert.equal(parseCachedPlaceDetails('{"displayName":"missing id"}'), null);
  assert.deepEqual(parseCachedPlaceDetails('{"id":"place-1","displayName":null}'), {
    id: "place-1",
    displayName: null,
  });
});
