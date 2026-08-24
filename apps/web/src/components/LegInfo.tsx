import { useLeg } from "../hooks/useLeg";
import { directDistanceMeters, LEG_MODE_OPTIONS } from "../legPreferences";
import type { PersistedLegMode, Spot } from "../types";
import { Button } from "./ui/button";

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}분`;
  return `${Math.floor(mins / 60)}시간 ${mins % 60}분`;
}

export function LegInfo({
  from,
  to,
  date,
  timezone,
  mode,
  selected,
  onSelect,
  onModeChange,
}: {
  from: Spot;
  to: Spot;
  date: string;
  timezone: string;
  mode: PersistedLegMode;
  selected: boolean;
  onSelect: () => void;
  onModeChange: (mode: PersistedLegMode) => void;
}) {
  const { data: leg, isError } = useLeg(from, to, mode, date, timezone);
  const hasMapLeg = (from.lat != null && from.lng != null && to.lat != null && to.lng != null) || (!!from.placeId && !!to.placeId);
  if (!hasMapLeg) return null;

  const parts: string[] = [];
  const directDistance = mode === "DIRECT" ? directDistanceMeters(from, to) : null;
  if (directDistance != null) parts.push(`직선 ${(directDistance / 1000).toFixed(1)}km`);
  if (leg?.durationS != null) parts.push(formatDuration(leg.durationS));
  if (leg?.distanceM != null) parts.push(`${(leg.distanceM / 1000).toFixed(1)}km`);
  if (leg?.fareAmount != null) parts.push(`${leg.fareCurrency ?? ""}${leg.fareAmount.toLocaleString()}`);
  const selectedOption = LEG_MODE_OPTIONS.find((option) => option.mode === mode)!;

  return (
    <div className={`leg-info${selected ? " selected" : ""}`} aria-label={`${from.name}에서 ${to.name}까지 동선`}>
      <Button type="button" variant={selected ? "secondary" : "ghost"} className="leg-summary meta" onClick={onSelect} aria-pressed={selected}>
        🧭 {parts.join(" · ") || `${selectedOption.label} 동선`}
      </Button>
      <fieldset className="leg-mode-picker">
        <legend>동선 선택</legend>
        {LEG_MODE_OPTIONS.map((option) => (
          <label key={option.mode} title={option.description}>
            <input
              type="radio"
              name={`leg-mode-${from.id}-${to.id}`}
              value={option.mode}
              checked={mode === option.mode}
              onChange={() => onModeChange(option.mode)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      {isError && <p className="leg-route-error" role="status">경로 정보를 불러오지 못했습니다. 직선 연결로 표시합니다.</p>}
    </div>
  );
}
