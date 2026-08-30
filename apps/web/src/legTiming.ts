import type { LegTiming, Spot } from "./types";

// Trip-local time arithmetic for a single itinerary leg. Kept separate from
// the query hook so the timezone handling can be tested without React, a
// network call, or the machine's own locale leaking in.

// Converts a "wall-clock time in an arbitrary IANA timezone" into a UTC
// ISO string, without a date library. Standard single-correction trick:
// guess the UTC instant assuming offset 0, ask what wall-clock time that
// instant reads as in `timeZone`, then shift by the difference. Accurate
// except within the ~1-2h window of a DST transition itself - fine for
// picking a cache bucket, not fine for scheduling a rocket launch.
export function zonedIso(date: string, time: string | undefined, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = (time ?? "12:00").split(":").map(Number);
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(guessMs))
      .map((p) => [p.type, p.value]),
  );
  const zonedMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return new Date(guessMs - (zonedMs - guessMs)).toISOString();
}

// The instant the leg is anchored to, plus which end of the journey that
// instant describes. AUTO leaves when the preceding stop is done with the
// traveller: its planned arrival plus however long they intend to stay.
export function resolveLegAnchor(from: Spot, timing: LegTiming, dayDate: string, timezone: string): {
  when: string;
  isArrival: boolean;
} {
  if (timing.kind === "AUTO") {
    const base = zonedIso(dayDate, from.plannedArrival, timezone);
    const dwellMs = (from.dwellMinutes ?? 0) * 60_000;
    return { when: new Date(Date.parse(base) + dwellMs).toISOString(), isArrival: false };
  }
  // A stored date matters for the overnight case, where the leg belongs to
  // one itinerary day but departs or lands on the next.
  return {
    when: zonedIso(timing.date ?? dayDate, timing.time, timezone),
    isArrival: timing.kind === "ARRIVE_BY",
  };
}

// Both ends of the journey, given whichever end the user pinned. Used to show
// an estimated departure and arrival next to each alternative.
export function legEndpoints(anchorIso: string, isArrival: boolean, durationS: number | null | undefined): {
  departure: string | null;
  arrival: string | null;
} {
  if (durationS == null) {
    return isArrival ? { departure: null, arrival: anchorIso } : { departure: anchorIso, arrival: null };
  }
  const durationMs = durationS * 1000;
  const anchorMs = Date.parse(anchorIso);
  return isArrival
    ? { departure: new Date(anchorMs - durationMs).toISOString(), arrival: anchorIso }
    : { departure: anchorIso, arrival: new Date(anchorMs + durationMs).toISOString() };
}

// "HH:mm" as read in the trip's timezone, so a Tokyo itinerary shows Tokyo
// clock times regardless of where the browser happens to be.
export function formatZonedClock(iso: string | null, timezone: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
