import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TIMEZONE, MAX_COVER_IMAGE_BYTES, TripImportSchema } from "./schema.js";

function tripWithCover(cover: unknown) {
  return {
    title: "도쿄 주말",
    startDate: "2026-09-07",
    endDate: "2026-09-08",
    days: [{ date: "2026-09-07", spots: [{ id: "tokyo-station", order: 0, name: "도쿄역", items: [] }] }],
    cover,
  };
}

test("a trip cover accepts a selected trip spot and supported image data URL", () => {
  const result = TripImportSchema.safeParse(
    tripWithCover({
      spotId: "tokyo-station",
      imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0hAAAAABJRU5ErkJggg==",
    }),
  );
  assert.equal(result.success, true);
});

test("a trip cover cannot reference a spot outside the itinerary", () => {
  const result = TripImportSchema.safeParse(tripWithCover({ spotId: "somewhere-else" }));
  assert.equal(result.success, false);
});

test("a trip cover rejects unsupported and oversized Base64 images", () => {
  const unsupported = TripImportSchema.safeParse(tripWithCover({ imageDataUrl: "data:image/gif;base64,AAAA" }));
  assert.equal(unsupported.success, false);

  const malformed = TripImportSchema.safeParse(tripWithCover({ imageDataUrl: "data:image/png;base64,A" }));
  assert.equal(malformed.success, false);

  const fakePng = TripImportSchema.safeParse(tripWithCover({ imageDataUrl: "data:image/png;base64,AAAA" }));
  assert.equal(fakePng.success, false);

  const encodedTooLarge = "A".repeat(Math.ceil(((MAX_COVER_IMAGE_BYTES + 1) * 4) / 3));
  const oversized = TripImportSchema.safeParse(tripWithCover({ imageDataUrl: `data:image/jpeg;base64,${encodedTooLarge}` }));
  assert.equal(oversized.success, false);
});

test("a blank or omitted trip timezone defaults to Seoul", () => {
  const blank = TripImportSchema.parse({ ...tripWithCover({ spotId: "tokyo-station" }), timezone: "" });
  const omitted = TripImportSchema.parse(tripWithCover({ spotId: "tokyo-station" }));

  assert.equal(blank.timezone, DEFAULT_TIMEZONE);
  assert.equal(omitted.timezone, DEFAULT_TIMEZONE);
});
