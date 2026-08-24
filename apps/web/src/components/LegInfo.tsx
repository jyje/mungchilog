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
  routeIndex,
  trafficAware,
  selected,
  onSelect,
  onModeChange,
  onRouteIndexChange,
  onTrafficAwareChange,
}: {
  from: Spot;
  to: Spot;
  date: string;
  timezone: string;
  mode: PersistedLegMode;
  routeIndex: number;
  trafficAware: boolean;
  selected: boolean;
  onSelect: () => void;
  onModeChange: (mode: PersistedLegMode) => void;
  onRouteIndexChange: (routeIndex: number) => void;
  onTrafficAwareChange: (trafficAware: boolean) => void;
}) {
  const { data: leg, isError } = useLeg(from, to, mode, trafficAware, date, timezone);
  const hasMapLeg = (from.lat != null && from.lng != null && to.lat != null && to.lng != null) || (!!from.placeId && !!to.placeId);
  if (!hasMapLeg) return null;

  const parts: string[] = [];
  const directDistance = mode === "DIRECT" ? directDistanceMeters(from, to) : null;
  if (mode === "DIRECT" && directDistance != null) parts.push(`직선 ${(directDistance / 1000).toFixed(1)}km`);
  const selectedRoute = leg?.routes[Math.min(routeIndex, Math.max(0, (leg?.routes.length ?? 1) - 1))];
  if (selectedRoute?.durationS != null) parts.push(formatDuration(selectedRoute.durationS));
  if (selectedRoute?.distanceM != null) parts.push(`${(selectedRoute.distanceM / 1000).toFixed(1)}km`);
  if (selectedRoute?.fareAmount != null) parts.push(`${selectedRoute.fareCurrency ?? ""}${selectedRoute.fareAmount.toLocaleString()}`);
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
      {mode === "DRIVE" && (
        <label className="leg-traffic-toggle">
          <input type="checkbox" checked={trafficAware} onChange={(event) => onTrafficAwareChange(event.target.checked)} />
          실시간 교통 반영
        </label>
      )}
      {mode !== "DIRECT" && leg && leg.routes.length > 1 && (
        <fieldset className="leg-route-picker">
          <legend>경로 선택</legend>
          {leg.routes.map((route, index) => {
            const routeParts = [
              route.durationS != null ? formatDuration(route.durationS) : null,
              route.distanceM != null ? `${(route.distanceM / 1000).toFixed(1)}km` : null,
            ].filter(Boolean);
            return (
              <label key={`${route.label}-${index}`}>
                <input
                  type="radio"
                  name={`leg-route-${from.id}-${to.id}`}
                  checked={routeIndex === index}
                  onChange={() => onRouteIndexChange(index)}
                />
                {index === 0 ? "추천 경로" : `대안 ${index}`} {routeParts.length > 0 && `(${routeParts.join(" · ")})`}
              </label>
            );
          })}
        </fieldset>
      )}
      {isError && <p className="leg-route-error" role="status">경로 정보를 불러오지 못했습니다. 직선 연결로 표시합니다.</p>}
    </div>
  );
}
