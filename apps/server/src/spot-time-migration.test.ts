import assert from "node:assert/strict";
import { test } from "node:test";
import { needsSpotTimingUpgrade, upgradeSpotTiming, upgradeTripData } from "./spot-time-migration.js";
import type { Spot, TripData } from "./schema.js";

function spot(overrides: Partial<Spot> = {}): Spot {
  return { id: "s", order: 0, name: "장소", bufferMinutes: 10, items: [], ...overrides } as Spot;
}

test("computes an absolute plannedDeparture from arrival + legacy dwellMinutes, and drops dwellMinutes", () => {
  const upgraded = upgradeSpotTiming(spot({ plannedArrival: "19:00", dwellMinutes: 90 }));
  assert.equal(upgraded.plannedDeparture, "20:30");
  assert.equal("dwellMinutes" in upgraded, false);
});

test("wraps a dwell duration that crosses midnight", () => {
  const upgraded = upgradeSpotTiming(spot({ plannedArrival: "23:30", dwellMinutes: 90 }));
  assert.equal(upgraded.plannedDeparture, "01:00");
});

test("is a no-op for a spot with no dwellMinutes at all", () => {
  const original = spot({ plannedArrival: "10:00" });
  assert.equal(upgradeSpotTiming(original), original);
});

test("drops a dwellMinutes that has nothing to measure from (no known arrival)", () => {
  const upgraded = upgradeSpotTiming(spot({ dwellMinutes: 45 }));
  assert.equal(upgraded.plannedDeparture, undefined);
  assert.equal("dwellMinutes" in upgraded, false);
});

test("prefers an already-set plannedDeparture and just drops the stale dwellMinutes", () => {
  const upgraded = upgradeSpotTiming(spot({ plannedArrival: "19:00", plannedDeparture: "21:00", dwellMinutes: 15 }));
  assert.equal(upgraded.plannedDeparture, "21:00");
  assert.equal("dwellMinutes" in upgraded, false);
});

test("is idempotent - running it again on its own output changes nothing further", () => {
  const once = upgradeSpotTiming(spot({ plannedArrival: "19:00", dwellMinutes: 90 }));
  const twice = upgradeSpotTiming(once);
  assert.equal(twice, once);
});

function tripData(spots: Spot[]): TripData {
  return {
    title: "여행",
    timezone: "Asia/Tokyo",
    currency: "JPY",
    startDate: "2026-09-07",
    endDate: "2026-09-07",
    days: [{ date: "2026-09-07", spots, legPreferences: [], groups: [] }],
  } as TripData;
}

test("upgradeTripData returns the same reference when nothing in the trip needs it", () => {
  const data = tripData([spot({ plannedArrival: "10:00" })]);
  assert.equal(upgradeTripData(data), data);
});

test("upgradeTripData rewrites every spot across every day that needs it", () => {
  const data = tripData([spot({ id: "a", plannedArrival: "10:00", dwellMinutes: 30 }), spot({ id: "b" })]);
  const upgraded = upgradeTripData(data);
  assert.notEqual(upgraded, data);
  assert.equal(upgraded.days[0].spots[0].plannedDeparture, "10:30");
  assert.equal(upgraded.days[0].spots[1], data.days[0].spots[1]);
});

test("needsSpotTimingUpgrade flags only spots still carrying dwellMinutes", () => {
  assert.equal(needsSpotTimingUpgrade(spot({ dwellMinutes: 10 })), true);
  assert.equal(needsSpotTimingUpgrade(spot({ plannedDeparture: "10:00" })), false);
  assert.equal(needsSpotTimingUpgrade(spot()), false);
});
