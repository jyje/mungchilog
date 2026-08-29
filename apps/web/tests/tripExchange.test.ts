import { describe, expect, it } from "vitest";
import { createTripExchange, parseTripExchange, TRIP_EXCHANGE_FORMAT } from "../src/tripExchange";
import { DEFAULT_TIMEZONE } from "../src/types";

const trip = {
  title: "파리 주말",
  timezone: "Europe/Paris",
  currency: "EUR",
  startDate: "2026-10-01",
  endDate: "2026-10-03",
  days: [{ date: "2026-10-01", spots: [{ id: "louvre", order: 0, name: "루브르", items: [] }] }],
  cover: { spotId: "louvre" },
};
const normalizedTrip = {
  ...trip,
  days: [{ ...trip.days[0], legPreferences: [], spots: [{ ...trip.days[0].spots[0], bufferMinutes: 10 }] }],
};

describe("portable trip exchange", () => {
  it("exports only a versioned, editable trip payload", () => {
    const exchange = createTripExchange({ ...trip, id: "server-id" } as typeof trip);

    expect(exchange.format).toBe(TRIP_EXCHANGE_FORMAT);
    expect(exchange.trip).toEqual(normalizedTrip);
    expect("id" in exchange.trip).toBe(false);
  });

  it("imports a portable file and never preserves an old id", () => {
    const imported = parseTripExchange({
      format: TRIP_EXCHANGE_FORMAT,
      version: 1,
      exportedAt: "2026-08-29T00:00:00.000Z",
      trip: { ...trip, id: "must-not-overwrite" },
    });

    expect(imported).toEqual(normalizedTrip);
    expect("id" in imported).toBe(false);
  });

  it("keeps legacy pasted itineraries compatible and normalizes a blank timezone", () => {
    const imported = parseTripExchange({ ...trip, timezone: "", id: "legacy-id" });

    expect(imported.timezone).toBe(DEFAULT_TIMEZONE);
    expect("id" in imported).toBe(false);
  });

  it("rejects an unsupported exchange version", () => {
    expect(() => parseTripExchange({ format: TRIP_EXCHANGE_FORMAT, version: 2, exportedAt: "2026-08-29T00:00:00.000Z", trip })).toThrow();
  });
});
