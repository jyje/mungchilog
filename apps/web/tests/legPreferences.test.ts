import { describe, expect, it } from "vitest";

import {
  DEFAULT_FLIGHT_DETAILS,
  DEFAULT_FLIGHT_TIMING,
  DEFAULT_LEG_TIMING,
  isLegacyLegMode,
  isRoutedLegMode,
  LEG_MODE_OPTIONS,
  legPreferenceFor,
  replaceLegPreference,
  selectedRouteIndex,
} from "../src/legPreferences";
import { LegPreferenceSchema } from "../src/types";

describe("selectable leg modes", () => {
  it("offers walking, transit, driving, and a manual flight", () => {
    expect(LEG_MODE_OPTIONS.map((option) => option.mode)).toEqual(["WALK", "TRANSIT", "DRIVE", "FLIGHT"]);
  });

  it("marks a straight line as legacy without breaking existing itineraries", () => {
    expect(isLegacyLegMode("DIRECT")).toBe(true);
    for (const mode of ["WALK", "TRANSIT", "DRIVE", "FLIGHT"] as const) {
      expect(isLegacyLegMode(mode)).toBe(false);
    }
  });

  it("only fetches a provider route for walking, transit, or driving - never a flight, which has none", () => {
    for (const mode of ["WALK", "TRANSIT", "DRIVE"] as const) {
      expect(isRoutedLegMode(mode)).toBe(true);
    }
    expect(isRoutedLegMode("FLIGHT")).toBe(false);
    expect(isRoutedLegMode("DIRECT")).toBe(false);
  });
});

describe("persisting a leg choice", () => {
  it("stores nothing when the leg still matches the default", () => {
    expect(replaceLegPreference([], "a", "b", "TRANSIT")).toEqual([]);
  });

  it("keeps a chosen route key and timing", () => {
    const [preference] = replaceLegPreference([], "a", "b", "TRANSIT", {
      routeKey: "abc123",
      timing: { kind: "DEPART_AT", time: "09:30" },
    });
    expect(preference).toMatchObject({ mode: "TRANSIT", routeKey: "abc123", timing: { kind: "DEPART_AT", time: "09:30" } });
    // Whatever it writes must satisfy the shared schema, or the save fails
    // server-side after the UI has already reported success.
    expect(LegPreferenceSchema.safeParse(preference).success).toBe(true);
  });

  it("drops arrive-by timing when the leg stops being transit", () => {
    const [preference] = replaceLegPreference([], "a", "b", "DRIVE", {
      timing: { kind: "ARRIVE_BY", time: "09:30" },
    });
    expect(preference.timing).toEqual(DEFAULT_LEG_TIMING);
    expect(LegPreferenceSchema.safeParse(preference).success).toBe(true);
  });

  it("gives a flight an immediately valid departure and arrival when none is supplied", () => {
    const [preference] = replaceLegPreference([], "a", "b", "FLIGHT");
    expect(preference.timing).toEqual(DEFAULT_FLIGHT_TIMING);
    expect(preference.flight).toEqual(DEFAULT_FLIGHT_DETAILS);
    expect(LegPreferenceSchema.safeParse(preference).success).toBe(true);
  });

  it("keeps a flight's chosen number and times", () => {
    const [preference] = replaceLegPreference([], "a", "b", "FLIGHT", {
      timing: { kind: "DEPART_AT", time: "10:00" },
      flight: { flightNumber: "OZ102", arrivalTime: "11:35" },
    });
    expect(preference).toMatchObject({
      mode: "FLIGHT",
      timing: { kind: "DEPART_AT", time: "10:00" },
      flight: { flightNumber: "OZ102", arrivalTime: "11:35" },
    });
    expect(LegPreferenceSchema.safeParse(preference).success).toBe(true);
  });

  it("drops flight details when the leg stops being a flight", () => {
    const [preference] = replaceLegPreference([], "a", "b", "WALK", {
      flight: { arrivalTime: "11:35" },
    });
    expect(preference.flight).toBeUndefined();
    expect(LegPreferenceSchema.safeParse(preference).success).toBe(true);
  });

  it("drops traffic awareness when the leg stops being a drive", () => {
    const saved = replaceLegPreference([], "a", "b", "WALK", { trafficAware: true });
    expect(saved[0].trafficAware).toBe(false);
    expect(LegPreferenceSchema.safeParse(saved[0]).success).toBe(true);
  });

  it("replaces only the matching directed pair", () => {
    const existing = replaceLegPreference([], "a", "b", "WALK");
    const both = replaceLegPreference(existing, "b", "c", "DRIVE");
    expect(both).toHaveLength(2);

    const updated = replaceLegPreference(both, "a", "b", "DRIVE");
    expect(updated).toHaveLength(2);
    expect(updated.find((p) => p.fromSpotId === "a")?.mode).toBe("DRIVE");
    expect(updated.find((p) => p.fromSpotId === "b")?.mode).toBe("DRIVE");
  });
});

describe("resolving the selected alternative", () => {
  const routes = [{ key: "first" }, { key: "second" }, { key: "third" }];

  it("follows the fingerprint even after the provider reorders alternatives", () => {
    const preference = legPreferenceFor([], "a", "b");
    const chosen = { ...preference, routeKey: "third", routeIndex: 2 };
    // Same journey, now returned first: the index would point elsewhere.
    expect(selectedRouteIndex([{ key: "third" }, { key: "first" }], chosen)).toBe(0);
    expect(selectedRouteIndex(routes, chosen)).toBe(2);
  });

  it("falls back to the recommended route when the saved journey is gone", () => {
    expect(selectedRouteIndex(routes, { routeIndex: 2, routeKey: "vanished" })).toBe(0);
  });

  it("still honours a pre-fingerprint index, clamped to what came back", () => {
    expect(selectedRouteIndex(routes, { routeIndex: 1, routeKey: undefined })).toBe(1);
    expect(selectedRouteIndex([{ key: "only" }], { routeIndex: 3, routeKey: undefined })).toBe(0);
  });

  it("survives an empty or missing route list", () => {
    expect(selectedRouteIndex([], { routeIndex: 2, routeKey: "x" })).toBe(0);
    expect(selectedRouteIndex(undefined, { routeIndex: 2, routeKey: "x" })).toBe(0);
  });
});
