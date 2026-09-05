import { describe, expect, it } from "vitest";

import { formatZonedClock, legEndpoints, resolveLegAnchor, zonedIso } from "../src/legTiming";
import type { Spot } from "../src/types";

function spot(overrides: Partial<Spot> = {}): Spot {
  return { id: "a", order: 0, name: "역", bufferMinutes: 10, items: [], ...overrides } as Spot;
}

describe("trip-local instants", () => {
  it("reads a wall-clock time in the trip timezone, not the machine's", () => {
    // 09:00 in Tokyo (UTC+9) is 00:00 UTC the same day.
    expect(zonedIso("2026-09-07", "09:00", "Asia/Tokyo")).toBe("2026-09-07T00:00:00.000Z");
    // The same wall clock in London is nine hours later in absolute terms.
    expect(zonedIso("2026-09-07", "09:00", "Europe/London")).toBe("2026-09-07T08:00:00.000Z");
  });

  it("falls back to midday, which still lands on the right weekday", () => {
    expect(zonedIso("2026-09-07", undefined, "Asia/Tokyo")).toBe("2026-09-07T03:00:00.000Z");
  });
});

describe("resolving when a leg happens", () => {
  it("derives automatic timing from the previous stop's arrival plus its dwell", () => {
    const anchor = resolveLegAnchor(
      spot({ plannedArrival: "09:00", dwellMinutes: 45 }),
      { kind: "AUTO" },
      "2026-09-07",
      "Asia/Tokyo",
    );
    // 09:00 + 45m of staying put = leaving at 09:45 Tokyo time.
    expect(anchor).toEqual({ when: "2026-09-07T00:45:00.000Z", isArrival: false });
  });

  it("treats a missing dwell as leaving immediately", () => {
    const anchor = resolveLegAnchor(spot({ plannedArrival: "09:00" }), { kind: "AUTO" }, "2026-09-07", "Asia/Tokyo");
    expect(anchor.when).toBe("2026-09-07T00:00:00.000Z");
  });

  it("uses the stored clock for a chosen departure", () => {
    const anchor = resolveLegAnchor(
      spot({ plannedArrival: "09:00", dwellMinutes: 45 }),
      { kind: "DEPART_AT", time: "11:30" },
      "2026-09-07",
      "Asia/Tokyo",
    );
    expect(anchor).toEqual({ when: "2026-09-07T02:30:00.000Z", isArrival: false });
  });

  it("marks an arrive-by leg as anchored at its far end", () => {
    const anchor = resolveLegAnchor(spot(), { kind: "ARRIVE_BY", time: "18:00" }, "2026-09-07", "Asia/Tokyo");
    expect(anchor.isArrival).toBe(true);
    expect(anchor.when).toBe("2026-09-07T09:00:00.000Z");
  });

  it("honours a stored date so an overnight leg is expressible", () => {
    const anchor = resolveLegAnchor(
      spot(),
      { kind: "ARRIVE_BY", date: "2026-09-08", time: "00:15" },
      "2026-09-07",
      "Asia/Tokyo",
    );
    expect(anchor.when).toBe("2026-09-07T15:15:00.000Z");
  });
});

describe("estimating both ends of a journey", () => {
  const anchor = "2026-09-07T00:00:00.000Z";

  it("adds the duration forward from a departure", () => {
    expect(legEndpoints(anchor, false, 1800)).toEqual({
      departure: anchor,
      arrival: "2026-09-07T00:30:00.000Z",
    });
  });

  it("works backward from a deadline when the user pinned the arrival", () => {
    expect(legEndpoints(anchor, true, 1800)).toEqual({
      departure: "2026-09-06T23:30:00.000Z",
      arrival: anchor,
    });
  });

  it("reports only the known end when the provider gave no duration", () => {
    expect(legEndpoints(anchor, false, null)).toEqual({ departure: anchor, arrival: null });
    expect(legEndpoints(anchor, true, undefined)).toEqual({ departure: null, arrival: anchor });
  });
});

describe("clock display", () => {
  it("renders in the trip timezone regardless of the browser's", () => {
    expect(formatZonedClock("2026-09-07T00:30:00.000Z", "Asia/Tokyo")).toBe("09:30");
    expect(formatZonedClock("2026-09-07T00:30:00.000Z", "Europe/London")).toBe("01:30");
  });

  it("passes an unknown time through as nothing to show", () => {
    expect(formatZonedClock(null, "Asia/Tokyo")).toBeNull();
  });
});
