import { useLeg } from "../hooks/useLeg";
import type { Spot } from "../types";

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}분`;
  return `${Math.floor(mins / 60)}시간 ${mins % 60}분`;
}

// Renders between two consecutive spots. Needs both placeIds - if either
// is missing (no map key yet, or the spot was hand-typed without one),
// there is nothing to compute and this renders nothing rather than an
// error. Once the server key lands (see docs/google-maps-setup.md) this
// starts returning real data with no code change here. The route line
// itself is drawn by RouteOverlay on the map, sharing this same cached
// leg (see hooks/useLeg.ts).
export function LegInfo({
  from,
  to,
  date,
  timezone,
  selected,
  onSelect,
}: {
  from: Spot;
  to: Spot;
  date: string;
  timezone: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { data: leg } = useLeg(from, to, date, timezone);

  const hasMapLeg = (from.lat != null && from.lng != null && to.lat != null && to.lng != null) || (!!from.placeId && !!to.placeId);
  if (!hasMapLeg) return null;
  if (!leg) {
    return (
      <button type="button" className={`leg-info meta${selected ? " selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
        🧭 동선 선택
      </button>
    );
  }

  const parts: string[] = [];
  if (leg.durationS != null) parts.push(formatDuration(leg.durationS));
  if (leg.distanceM != null) parts.push(`${(leg.distanceM / 1000).toFixed(1)}km`);
  if (leg.fareAmount != null) parts.push(`${leg.fareCurrency ?? ""}${leg.fareAmount.toLocaleString()}`);

  return (
    <button type="button" className={`leg-info meta${selected ? " selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
      🚃 {parts.join(" · ") || "동선 선택"}
    </button>
  );
}
