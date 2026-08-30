import type { Spot, SpotTimeKind } from "./types";

const MINUTES_PER_DAY = 24 * 60;

export function effectiveTimeKind(spot: Pick<Spot, "plannedArrival" | "timeKind">): SpotTimeKind | null {
  if (!spot.plannedArrival) return null;
  return spot.timeKind ?? "APPROXIMATE";
}

export function wallClockMinutes(value: string | undefined): number | null {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
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
  start: string;
  end: string | null;
  durationMinutes: number | null;
  crossesMidnight: boolean;
};

export function spotScheduleDisplay(spot: Pick<Spot, "plannedArrival" | "timeKind" | "dwellMinutes">): SpotScheduleDisplay | null {
  const startMinutes = wallClockMinutes(spot.plannedArrival);
  const kind = effectiveTimeKind(spot);
  if (startMinutes == null || !kind || !spot.plannedArrival) return null;
  const durationMinutes = spot.dwellMinutes != null ? spot.dwellMinutes : null;
  const end = durationMinutes != null ? formatMinutes(startMinutes + durationMinutes) : null;
  return {
    kind,
    label: kind === "RESERVATION" ? "예약" : "대략",
    start: spot.plannedArrival,
    end: end?.time ?? null,
    durationMinutes,
    crossesMidnight: (end?.dayOffset ?? 0) > 0,
  };
}

export type ScheduleWarning = { spotId: string; message: string };

export function scheduleWarnings(spots: Array<Pick<Spot, "id" | "plannedArrival" | "dwellMinutes">>): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  let previous: { start: number; end: number } | null = null;

  for (const spot of spots) {
    const start = wallClockMinutes(spot.plannedArrival);
    if (start == null) {
      previous = null;
      continue;
    }
    if (previous && start < previous.end) {
      const end = formatMinutes(previous.end);
      warnings.push({
        spotId: spot.id,
        message: start < previous.start
          ? "앞 일정의 시각보다 이릅니다. 순서를 확인해주세요."
          : `앞 일정의 예상 종료 ${end.time}${end.dayOffset > 0 ? " (다음 날)" : ""}와 겹칩니다.`,
      });
    }
    previous = { start, end: start + (spot.dwellMinutes ?? 0) };
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

export function tripWallClockIso(date: string, time: string, timeZone: string, minuteOffset = 0): string {
  const target = localDateTime(date, time, minuteOffset);
  const targetMs = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0);
  let candidate = targetMs;

  for (let attempt = 0; attempt < 2; attempt += 1) {
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
    candidate -= renderedMs - targetMs;
  }

  return new Date(candidate).toISOString();
}

export function routeDepartureIso(date: string, spot: Pick<Spot, "plannedArrival" | "dwellMinutes">, timeZone: string): string {
  const hasSchedule = wallClockMinutes(spot.plannedArrival) != null;
  return tripWallClockIso(
    date,
    hasSchedule ? spot.plannedArrival! : "12:00",
    timeZone,
    hasSchedule ? spot.dwellMinutes ?? 0 : 0,
  );
}
