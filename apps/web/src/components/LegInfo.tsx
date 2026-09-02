import { useState } from "react";
import { BusFront, CarFront, Footprints, Route, TrainFront, TramFront } from "lucide-react";
import { useLeg } from "../hooks/useLeg";
import { formatZonedClock, legEndpoints, resolveLegAnchor } from "../legTiming";
import { directDistanceMeters, isLegacyLegMode, LEG_MODE_OPTIONS, selectedRouteIndex } from "../legPreferences";
import type { LegPreference, LegTiming, PersistedLegMode, Spot } from "../types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Switch } from "./ui/switch";
import { PlannerChoiceGroup, PlannerChoiceItem } from "./system/PlannerChoiceGroup";

type LegPatch = Partial<Pick<LegPreference, "routeIndex" | "routeKey" | "timing" | "trafficAware">> & {
  mode?: PersistedLegMode;
};

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}분`;
  return `${Math.floor(mins / 60)}시간 ${mins % 60}분`;
}

function TransitVehicleIcon({ vehicle }: { vehicle: string | null | undefined }) {
  const normalized = vehicle?.toUpperCase() ?? "";
  const Icon = normalized.includes("BUS") ? BusFront : normalized.includes("TRAM") ? TramFront : TrainFront;
  return <Icon aria-hidden="true" />;
}

function modeSummaryIcon(mode: PersistedLegMode) {
  if (mode === "WALK") return <Footprints aria-hidden="true" />;
  if (mode === "DRIVE") return <CarFront aria-hidden="true" />;
  if (mode === "TRANSIT") return <TrainFront aria-hidden="true" />;
  return <Route aria-hidden="true" />;
}

function transitSummary(details: Array<{ vehicle: string | null; line: string | null; headsign: string | null }> | null | undefined): string | null {
  if (!details?.length) return null;
  return details.map((detail) => {
    if (detail.line && detail.headsign) return `${detail.line} · ${detail.headsign} 방면`;
    if (detail.line) return detail.line;
    if (detail.headsign) return detail.headsign;
    const vehicle = detail.vehicle?.toUpperCase() ?? "";
    if (vehicle.includes("BUS")) return "버스";
    if (vehicle.includes("TRAM")) return "트램";
    if (vehicle) return "철도";
    return "경로 정보 없음";
  }).join(" → ");
}

const TIMING_LABELS: Record<LegTiming["kind"], string> = {
  AUTO: "자동",
  DEPART_AT: "출발 시각",
  ARRIVE_BY: "도착 시각",
};

// The transit timing editor. Kept in a popover so the leg row stays compact,
// and edits apply on submit rather than per-keystroke - a half-typed hour
// must never be saved as a real departure.
function TransitTimingEditor({
  timing,
  dayDate,
  onApply,
}: {
  timing: LegTiming;
  dayDate: string;
  onApply: (timing: LegTiming) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LegTiming>(timing);

  function openChange(next: boolean) {
    // Reopening always starts from what is actually saved, so an abandoned
    // edit never reappears as if it had been applied.
    if (next) setDraft(timing);
    setOpen(next);
  }

  function apply() {
    if (draft.kind !== "AUTO" && !draft.time) return;
    onApply(
      draft.kind === "AUTO"
        ? { kind: "AUTO" }
        : { kind: draft.kind, time: draft.time, ...(draft.date && draft.date !== dayDate ? { date: draft.date } : {}) },
    );
    setOpen(false);
  }

  const summary = timing.kind === "AUTO" ? "자동" : `${TIMING_LABELS[timing.kind]} ${timing.time}`;

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="leg-timing-trigger">
          🕘 {summary}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="leg-timing-editor">
        <fieldset className="leg-timing-kind">
          <legend>시간 기준</legend>
          <RadioGroup
            value={draft.kind}
            onValueChange={(kind) => setDraft((current) => ({ ...current, kind: kind as LegTiming["kind"] }))}
          >
            {(["AUTO", "DEPART_AT", "ARRIVE_BY"] as const).map((kind) => (
              <label key={kind} className="leg-timing-option">
                <RadioGroupItem value={kind} />
                {TIMING_LABELS[kind]}
              </label>
            ))}
          </RadioGroup>
        </fieldset>
        {draft.kind === "AUTO" ? (
          <p className="meta leg-timing-hint">앞 장소의 도착 시각과 머무는 시간에서 자동으로 계산합니다.</p>
        ) : (
          <div className="leg-timing-fields">
            <label>
              날짜
              <Input
                type="date"
                value={draft.date ?? dayDate}
                onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
              />
            </label>
            <label>
              시각
              <Input
                type="time"
                value={draft.time ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))}
              />
            </label>
          </div>
        )}
        <div className="leg-timing-actions">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button type="button" size="sm" onClick={apply} disabled={draft.kind !== "AUTO" && !draft.time}>
            적용
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function LegInfo({
  from,
  to,
  date,
  timezone,
  preference,
  selected,
  onSelect,
  onChange,
}: {
  from: Spot;
  to: Spot;
  date: string;
  timezone: string;
  preference: LegPreference;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: LegPatch) => void;
}) {
  const { mode, timing, trafficAware } = preference;
  const { data: leg, isError, isLoading } = useLeg(from, to, mode, trafficAware, date, timezone, timing);
  const hasMapLeg = (from.lat != null && from.lng != null && to.lat != null && to.lng != null) || (!!from.placeId && !!to.placeId);
  if (!hasMapLeg) return null;

  const legacyMode = isLegacyLegMode(mode);
  const routeIndex = selectedRouteIndex(leg?.routes, preference);
  const selectedRoute = leg?.routes[routeIndex];
  const anchor = resolveLegAnchor(from, timing, date, timezone);

  const parts: string[] = [];
  if (selectedRoute?.durationS != null) parts.push(formatDuration(selectedRoute.durationS));
  if (selectedRoute?.distanceM != null) parts.push(`${(selectedRoute.distanceM / 1000).toFixed(1)}km`);
  if (selectedRoute?.fareAmount != null) parts.push(`${selectedRoute.fareCurrency ?? ""}${selectedRoute.fareAmount.toLocaleString()}`);
  if (parts.length === 0 && legacyMode) {
    const straight = directDistanceMeters(from, to);
    if (straight != null) parts.push(`직선 ${(straight / 1000).toFixed(1)}km`);
  }
  const modeLabel = LEG_MODE_OPTIONS.find((option) => option.mode === mode)?.label ?? "직선(사용 중지됨)";
  const transitDetails = selectedRoute?.transit;
  const transitLabel = transitSummary(transitDetails);
  const firstTransit = transitDetails?.[0];

  return (
    <div className={`leg-info${selected ? " selected" : ""}`} aria-label={`${from.name}에서 ${to.name}까지 동선`}>
      <Button
        type="button"
        variant={selected ? "secondary" : "ghost"}
        className="leg-summary meta"
        onClick={onSelect}
        aria-pressed={selected}
      >
        {mode === "TRANSIT" ? (
          <>
            <TransitVehicleIcon vehicle={firstTransit?.vehicle} />
            <span>{transitLabel ?? "경로 정보 없음"}</span>
            {parts.length > 0 && <span className="leg-summary-meta">{parts.join(" · ")}</span>}
          </>
        ) : (
          <>
            {modeSummaryIcon(mode)}
            <span>{parts.join(" · ") || `${modeLabel} 동선`}</span>
          </>
        )}
      </Button>

      <PlannerChoiceGroup
        value={legacyMode ? "" : mode}
        // Radix reports "" when the active item is pressed again. Ignore it:
        // a leg always travels by some means, so there is no "no mode" state
        // to fall back to.
        onValueChange={(next) => { if (next) onChange({ mode: next as PersistedLegMode }); }}
        className="leg-mode-toggle"
        aria-label={`${from.name}에서 ${to.name}까지 이동 수단`}
      >
        {LEG_MODE_OPTIONS.map((option) => (
          <PlannerChoiceItem key={option.mode} value={option.mode} aria-label={option.description} title={option.description}>
            {option.label}
          </PlannerChoiceItem>
        ))}
      </PlannerChoiceGroup>

      {legacyMode && (
        <p className="leg-legacy-note" role="status">
          직선 표시는 더 이상 지원하지 않습니다. 이동 수단을 선택하면 실제 경로로 바뀝니다.
        </p>
      )}

      {mode === "TRANSIT" && (
        <TransitTimingEditor timing={timing} dayDate={date} onApply={(next) => onChange({ timing: next })} />
      )}

      {mode === "DRIVE" && (
        <label className="leg-traffic-toggle">
          <Switch checked={trafficAware} onCheckedChange={(next) => onChange({ trafficAware: next })} />
          실시간 교통 반영
        </label>
      )}

      {!legacyMode && leg && leg.routes.length > 1 && (
        <fieldset className="leg-route-picker">
          <legend>경로 선택</legend>
          <RadioGroup
            value={String(routeIndex)}
            onValueChange={(next) => {
              const index = Number(next);
              // Persist the fingerprint, not just the position: the list can
              // come back in a different order after a cache refresh.
              onChange({ routeIndex: index, routeKey: leg.routes[index]?.key });
            }}
          >
            {leg.routes.map((route, index) => {
              const endpoints = legEndpoints(anchor.when, anchor.isArrival, route.durationS);
              const departure = formatZonedClock(endpoints.departure, timezone);
              const arrival = formatZonedClock(endpoints.arrival, timezone);
              const routeParts = [
                route.durationS != null ? formatDuration(route.durationS) : null,
                route.distanceM != null ? `${(route.distanceM / 1000).toFixed(1)}km` : null,
                departure && arrival ? `${departure}→${arrival}` : null,
                route.fareAmount != null ? `${route.fareCurrency ?? ""}${route.fareAmount.toLocaleString()}` : null,
              ].filter(Boolean);
              return (
                <label key={route.key} className="leg-route-option">
                  <RadioGroupItem value={String(index)} />
                  <span>
                    {index === 0 ? "추천 경로" : `대안 ${index}`}
                    {routeParts.length > 0 && ` (${routeParts.join(" · ")})`}
                  </span>
                </label>
              );
            })}
          </RadioGroup>
        </fieldset>
      )}

      {trafficAware && mode === "DRIVE" && !isError && (
        <p className="meta leg-traffic-note">실시간 교통 정보는 몇 분 동안만 유효하며, 이후에는 다시 계산합니다.</p>
      )}

      {isLoading && <p className="meta" role="status">경로를 불러오는 중입니다.</p>}

      {isError && (
        <p className="leg-route-error" role="status">
          경로를 불러오지 못했습니다. 지도에는 임시로 직선 미리보기를 표시하며, 선택한 이동 수단은 그대로 유지됩니다.
        </p>
      )}
    </div>
  );
}
