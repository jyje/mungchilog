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

test("leg preferences are optional for existing trips and validate their spot pairs", () => {
  const legacy = TripImportSchema.safeParse(tripWithCover(undefined));
  assert.equal(legacy.success, true);
  if (legacy.success) assert.deepEqual(legacy.data.days[0].legPreferences, []);

  const drivingWithTraffic = TripImportSchema.safeParse({
    ...tripWithCover(undefined),
    days: [{
      date: "2026-09-07",
      spots: [
        { id: "station", order: 0, name: "역", items: [] },
        { id: "hotel", order: 1, name: "호텔", items: [] },
      ],
      legPreferences: [{ fromSpotId: "station", toSpotId: "hotel", mode: "DRIVE", routeIndex: 2, trafficAware: true }],
    }],
  });
  assert.equal(drivingWithTraffic.success, true);

  const invalid = TripImportSchema.safeParse({
    ...tripWithCover(undefined),
    days: [{
      date: "2026-09-07",
      spots: [{ id: "station", order: 0, name: "역", items: [] }],
      legPreferences: [{ fromSpotId: "station", toSpotId: "missing", mode: "WALK" }],
    }],
  });
  assert.equal(invalid.success, false);

  const invalidTraffic = TripImportSchema.safeParse({
    ...tripWithCover(undefined),
    days: [{
      date: "2026-09-07",
      spots: [
        { id: "station", order: 0, name: "역", items: [] },
        { id: "hotel", order: 1, name: "호텔", items: [] },
      ],
      legPreferences: [{ fromSpotId: "station", toSpotId: "hotel", mode: "TRANSIT", trafficAware: true }],
    }],
  });
  assert.equal(invalidTraffic.success, false);
});

test("arbitrary spot coordinates are finite, ranged, and stored as a pair", () => {
  const withSpot = (spot: Record<string, unknown>) => TripImportSchema.safeParse({
    ...tripWithCover(undefined),
    days: [{ date: "2026-09-07", spots: [{ id: "point", order: 0, name: "공터", items: [], ...spot }] }],
  });

  assert.equal(withSpot({ lat: 0, lng: 0 }).success, true);
  assert.equal(withSpot({ lat: 37.5, lng: 127 }).success, true);
  assert.equal(withSpot({ lat: 37.5 }).success, false);
  assert.equal(withSpot({ lng: 127 }).success, false);
  assert.equal(withSpot({ lat: 91, lng: 127 }).success, false);
  assert.equal(withSpot({ lat: 37.5, lng: 181 }).success, false);
});

test("spot schedules preserve legacy times and validate explicit semantics", () => {
  const withSpot = (spot: Record<string, unknown>) => TripImportSchema.safeParse({
    ...tripWithCover(undefined),
    days: [{ date: "2026-09-07", spots: [{ id: "point", order: 0, name: "예약 장소", items: [], ...spot }] }],
  });

  const legacy = withSpot({ plannedArrival: "10:30" });
  assert.equal(legacy.success, true);
  if (legacy.success) assert.equal(legacy.data.days[0].spots[0].timeKind, undefined);

  assert.equal(withSpot({ plannedArrival: "19:00", timeKind: "RESERVATION", dwellMinutes: 90 }).success, true);
  assert.equal(withSpot({ plannedArrival: "9:00", timeKind: "APPROXIMATE" }).success, false);
  assert.equal(withSpot({ timeKind: "RESERVATION" }).success, false);
  assert.equal(withSpot({ plannedArrival: "24:00" }).success, false);
});
