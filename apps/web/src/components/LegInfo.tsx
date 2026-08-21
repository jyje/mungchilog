import { useQuery } from "@tanstack/react-query";
import { computeLeg } from "../api";
import type { Spot } from "../types";

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}분`;
  return `${Math.floor(mins / 60)}시간 ${mins % 60}분`;
}

// Converts a "wall-clock time in an arbitrary IANA timezone" into a UTC
// ISO string, without a date library. Standard single-correction trick:
// guess the UTC instant assuming offset 0, ask what wall-clock time that
// instant reads as in `timeZone`, then shift by the difference. Accurate
// except within the ~1-2h window of a DST transition itself - fine for
// picking a cache bucket, not fine for scheduling a rocket launch.
function zonedIso(date: string, time: string | undefined, timeZone: string): string {
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
  const offsetMs = zonedMs - guessMs;
  return new Date(guessMs - offsetMs).toISOString();
}

// Renders between two consecutive spots. Needs both placeIds - if either
// is missing (no map key yet, or the spot was hand-typed without one),
// there is nothing to compute and this renders nothing rather than an
// error. Once the server key lands (see docs/google-maps-setup.md) this
// starts returning real data with no code change here.
export function LegInfo({ from, to, date, timezone }: { from: Spot; to: Spot; date: string; timezone: string }) {
  const enabled = !!from.placeId && !!to.placeId;
  // day.date + the departing spot's plannedArrival, in the trip's own
  // timezone (see zonedIso above) - not the browser's, not the test
  // runner's. Falls back to noon when no arrival time is set, which
  // still gets the weekday right, which is what actually determines the
  // server's cache bucket and the TRANSIT schedule Google returns.
  const when = zonedIso(date, from.plannedArrival, timezone);

  const { data: leg } = useQuery({
    queryKey: ["leg", from.placeId, to.placeId, "TRANSIT", when],
    queryFn: () => computeLeg(from.placeId!, to.placeId!, "TRANSIT", when, timezone),
    enabled,
    staleTime: 1000 * 60 * 60 * 24 * 30, // matches the server's 30-day leg cache
  });

  if (!enabled) return null;
  if (!leg) return <div className="leg-info meta">구간 정보 (지도 API 키 도착 시 표시)</div>;

  const parts: string[] = [];
  if (leg.durationS != null) parts.push(formatDuration(leg.durationS));
  if (leg.distanceM != null) parts.push(`${(leg.distanceM / 1000).toFixed(1)}km`);
  if (leg.fareAmount != null) parts.push(`${leg.fareCurrency ?? ""}${leg.fareAmount.toLocaleString()}`);

  return <div className="leg-info meta">🚃 {parts.join(" · ")}</div>;
}
