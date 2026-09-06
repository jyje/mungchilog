import type { Spot, TripData } from "./schema.js";

// v0.2.0 replaced a spot's dwellMinutes (a duration relative to
// plannedArrival - so a spot with only a known end time and no known start
// had no way to be represented at all) with an independent plannedDeparture
// wall-clock field. The app itself is backward compatible indefinitely
// (schedule.ts's spotScheduleDisplay falls back to dwellMinutes when
// plannedDeparture is absent), so this migration is not required for
// correctness - it exists to actually clean up the stored data instead of
// leaving two overlapping representations around forever. Target removal
// of dwellMinutes from the schema entirely: v0.2.1. See
// docs/migrations/2026-spot-planned-departure.md for the full plan and
// apps/server/scripts/migrate-spot-time-fields.ts for the runnable script.
const MINUTES_PER_DAY = 24 * 60;

function formatMinutes(value: number): string {
  const normalized = ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function wallClockMinutes(value: string | undefined): number | null {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

/**
 * Upgrades one spot's timing fields in place-equivalent (returns a new
 * object; never mutates the input). Idempotent: a spot that already has
 * plannedDeparture, or has neither an arrival nor a dwell duration to
 * derive one from, comes back with only dwellMinutes stripped away.
 *
 * Returns the SAME reference (spot) when nothing needed to change, so a
 * caller can cheaply skip rewriting a trip row where every spot was already
 * current - see hasSpotTimeMigrationWork below.
 */
export function upgradeSpotTiming(spot: Spot): Spot {
  if (spot.dwellMinutes == null) return spot;

  const { dwellMinutes, ...rest } = spot;
  if (spot.plannedDeparture != null) {
    // Already has an authoritative end time; the legacy duration is now
    // pure dead weight regardless of what it says.
    return rest;
  }

  const startMinutes = wallClockMinutes(spot.plannedArrival);
  if (startMinutes == null) {
    // A dwell duration with no arrival to measure from never described
    // anything real - drop it rather than inventing a start.
    return rest;
  }

  return { ...rest, plannedDeparture: formatMinutes(startMinutes + dwellMinutes) };
}

/** True if upgradeSpotTiming would produce a different value for this spot. */
export function needsSpotTimingUpgrade(spot: Spot): boolean {
  return spot.dwellMinutes != null;
}

/**
 * Upgrades every spot across every day of one trip. Returns the SAME `data`
 * reference when no spot needed a change, so a caller can compare by
 * reference to decide whether a row actually needs rewriting.
 */
export function upgradeTripData(data: TripData): TripData {
  if (!data.days.some((day) => day.spots.some(needsSpotTimingUpgrade))) return data;
  return {
    ...data,
    days: data.days.map((day) => ({
      ...day,
      spots: day.spots.map(upgradeSpotTiming),
    })),
  };
}
