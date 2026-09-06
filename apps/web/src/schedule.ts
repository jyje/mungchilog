import type { Spot, SpotTimeKind } from "./types";

const MINUTES_PER_DAY = 24 * 60;

export function effectiveTimeKind(spot: Pick<Spot, "plannedArrival" | "plannedDeparture" | "timeKind">): SpotTimeKind | null {
  if (!spot.plannedArrival && !spot.plannedDeparture) return null;
  return spot.timeKind ?? "APPROXIMATE";
}

export function wallClockMinutes(value: string | undefined): number | null {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

// A spot's known interval, in minutes since local midnight. Either end can
// be absent (unknown start, unknown end, or both) - none of the four
// combinations are invalid. `end` prefers the explicit plannedDeparture;
// the legacy dwellMinutes duration only fills in when no explicit end was
// ever recorded, and only when a start exists to measure it from. `end` is
// pushed past MINUTES_PER_DAY (not wrapped) when it reads earlier than a
// known start, so a caller can tell it crossed midnight.
function spotTimeInterval(spot: Pick<Spot, "plannedArrival" | "plannedDeparture" | "dwellMinutes">): {
  start: number | null;
  end: number | null;
} {
  const start = wallClockMinutes(spot.plannedArrival);
  let end: number | null = null;
  if (spot.plannedDeparture) {
    const raw = wallClockMinutes(spot.plannedDeparture);
    if (raw != null) end = start != null && raw < start ? raw + MINUTES_PER_DAY : raw;
  } else if (start != null && spot.dwellMinutes != null) {
    end = start + spot.dwellMinutes;
  }
  return { start, end };
}

function formatMinutes(value: number): { time: string; dayOffset: number } {
  const dayOffset = Math.floor(value / MINUTES_PER_DAY);
  const normalized = ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return { time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, dayOffset };
}

export type SpotScheduleDisplay = {
  kind: SpotTimeKind;
  label: string;
  // Either can be null on its own - a spot may have a known end with no
  // known start ("모르지만 몇 시까지는 마쳐야 함"), and vice versa.
  start: string | null;
  end: string | null;
  durationMinutes: number | null;
  crossesMidnight: boolean;
};

export function spotScheduleDisplay(spot: Pick<Spot, "plannedArrival" | "plannedDeparture" | "timeKind" | "dwellMinutes">): SpotScheduleDisplay | null {
  const kind = effectiveTimeKind(spot);
  if (!kind) return null;
  const { start: startMinutes, end: endMinutes } = spotTimeInterval(spot);
  const end = endMinutes != null ? formatMinutes(endMinutes) : null;
  return {
    kind,
    label: kind === "RESERVATION" ? "예약" : "대략",
    start: spot.plannedArrival ?? null,
    end: end?.time ?? null,
    durationMinutes: startMinutes != null && endMinutes != null ? endMinutes - startMinutes : null,
    crossesMidnight: (end?.dayOffset ?? 0) > 0,
  };
}

export type ScheduleWarning = { spotId: string; message: string };

export function scheduleWarnings(
  spots: Array<Pick<Spot, "id" | "plannedArrival" | "plannedDeparture" | "dwellMinutes">>,
  date?: string,
  timeZone?: string,
): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  let previous: { start: number; end: number } | null = null;

  for (const spot of spots) {
    if (date && timeZone) {
      const dstGap = [spot.plannedArrival, spot.plannedDeparture].some(
        (value) => value && !resolveTripWallClock(date, value, timeZone).exact,
      );
      if (dstGap) {
        warnings.push({
          spotId: spot.id,
          message: "이 시각은 여행지 표준시의 일광 절약 시간 전환으로 존재하지 않습니다. 다른 시각을 선택해주세요.",
        });
        previous = null;
        continue;
      }
    }
    const { start, end } = spotTimeInterval(spot);
    // Neither end is known - this stop breaks the chain rather than
    // silently reusing whatever the previous stop's interval was; nothing
    // here can conflict with anything, known or not.
    const anchor = start ?? end;
    if (anchor == null) {
      previous = null;
      continue;
    }
    if (previous && anchor < previous.end) {
      const previousEnd = formatMinutes(previous.end);
      warnings.push({
        spotId: spot.id,
        message: anchor < previous.start
          ? "앞 일정의 시각보다 이릅니다. 순서를 확인해주세요."
          : `앞 일정의 예상 종료 ${previousEnd.time}${previousEnd.dayOffset > 0 ? " (다음 날)" : ""}와 겹칩니다.`,
      });
    }
    previous = { start: start ?? anchor, end: end ?? anchor };
  }

  return warnings;
}

function localDateTime(date: string, time: string, minuteOffset: number) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day, hour, minute) + minuteOffset * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function resolveTripWallClock(date: string, time: string, timeZone: string, minuteOffset = 0): {
  iso: string;
  exact: boolean;
} {
  const target = localDateTime(date, time, minuteOffset);
  const targetMs = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0);
  let candidate = targetMs;
  const alternatives: Array<{ candidate: number; renderedMs: number }> = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
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
        .formatToParts(new Date(candidate))
        .map((part) => [part.type, part.value]),
    );
    const renderedMs = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    if (renderedMs === targetMs) return { iso: new Date(candidate).toISOString(), exact: true };
    alternatives.push({ candidate, renderedMs });
    candidate -= renderedMs - targetMs;
  }

  // A spring-forward gap has no exact instant. Follow the conventional
  // compatible behavior and move to the first representable local time after
  // the gap, while exposing `exact: false` so editors can reject it instead
  // of silently showing the user a different clock time.
  const later = alternatives
    .filter((alternative) => alternative.renderedMs > targetMs)
    .sort((a, b) => a.renderedMs - b.renderedMs)[0];
  return { iso: new Date(later?.candidate ?? candidate).toISOString(), exact: false };
}

export function tripWallClockIso(date: string, time: string, timeZone: string, minuteOffset = 0): string {
  return resolveTripWallClock(date, time, timeZone, minuteOffset).iso;
}

export function routeDepartureIso(
  date: string,
  spot: Pick<Spot, "plannedArrival" | "plannedDeparture" | "dwellMinutes">,
  timeZone: string,
): string {
  if (spot.plannedArrival) {
    const startMinutes = wallClockMinutes(spot.plannedArrival)!;
    let offsetMinutes = spot.dwellMinutes ?? 0;
    const departureMinutes = wallClockMinutes(spot.plannedDeparture);
    if (departureMinutes != null) {
      offsetMinutes = departureMinutes < startMinutes ? departureMinutes + MINUTES_PER_DAY - startMinutes : departureMinutes - startMinutes;
    }
    return tripWallClockIso(date, spot.plannedArrival, timeZone, offsetMinutes);
  }
  // No known start - an explicit departure-only time is itself the anchor,
  // not an offset from anything.
  if (wallClockMinutes(spot.plannedDeparture) != null) {
    return tripWallClockIso(date, spot.plannedDeparture!, timeZone, 0);
  }
  return tripWallClockIso(date, "12:00", timeZone, 0);
}
