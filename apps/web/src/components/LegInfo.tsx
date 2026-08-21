import { useQuery } from "@tanstack/react-query";
import { computeLeg } from "../api";
import type { Spot } from "../types";

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}분`;
  return `${Math.floor(mins / 60)}시간 ${mins % 60}분`;
}

// day.date + a spot's plannedArrival, pinned to +09:00 (Asia/Tokyo has no
// DST, so this is safe year-round) rather than letting `new Date()` parse
// it in whatever timezone the browser happens to be in. Falls back to
// noon when no arrival time is set - still gets the weekday right, which
// is what actually determines the server's cache bucket and the TRANSIT
// schedule Google returns (see jyje/cluster#55).
function tokyoIso(date: string, time: string | undefined): string {
  return new Date(`${date}T${time ?? "12:00"}:00+09:00`).toISOString();
}

// Renders between two consecutive spots. Needs both placeIds - if either
// is missing (no map key yet, or the spot was hand-typed without one),
// there is nothing to compute and this renders nothing rather than an
// error. Once the server key lands (see docs/google-maps-setup.md) this
// starts returning real data with no code change here.
export function LegInfo({ from, to, date }: { from: Spot; to: Spot; date: string }) {
  const enabled = !!from.placeId && !!to.placeId;
  const when = tokyoIso(date, from.plannedArrival);

  const { data: leg } = useQuery({
    queryKey: ["leg", from.placeId, to.placeId, "TRANSIT", when],
    queryFn: () => computeLeg(from.placeId!, to.placeId!, "TRANSIT", when),
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
