import { SELECTABLE_LEG_MODES } from "./types";
import type { LegPreference, LegTiming, PersistedLegMode, SelectableLegMode, Spot } from "./types";

export const DEFAULT_LEG_MODE: SelectableLegMode = "TRANSIT";
export const DEFAULT_LEG_TIMING: LegTiming = { kind: "AUTO" };

// Only these three are offered for new selections. DIRECT is deliberately
// absent: a straight line is a drawing, not a route (issue 48).
export const LEG_MODE_OPTIONS: Array<{ mode: SelectableLegMode; label: string; description: string }> = [
  { mode: "WALK", label: "도보", description: "보행자 경로" },
  { mode: "TRANSIT", label: "대중교통", description: "대중교통 시간표 경로" },
  { mode: "DRIVE", label: "운전", description: "도로 경로" },
];

// A leg saved before issue 48, or imported from an older export. It still
// renders, but as an explicitly unavailable state rather than a mode we would
// keep promoting.
export function isLegacyLegMode(mode: PersistedLegMode): boolean {
  return !(SELECTABLE_LEG_MODES as readonly string[]).includes(mode);
}

export function legModeFor(preferences: LegPreference[] | undefined, fromSpotId: string, toSpotId: string): PersistedLegMode {
  return preferences?.find((preference) => preference.fromSpotId === fromSpotId && preference.toSpotId === toSpotId)?.mode ?? DEFAULT_LEG_MODE;
}

export function legPreferenceFor(preferences: LegPreference[] | undefined, fromSpotId: string, toSpotId: string): LegPreference {
  return preferences?.find((preference) => preference.fromSpotId === fromSpotId && preference.toSpotId === toSpotId)
    ?? { fromSpotId, toSpotId, mode: DEFAULT_LEG_MODE, routeIndex: 0, timing: DEFAULT_LEG_TIMING, trafficAware: false };
}

// TRANSIT with automatic timing is the default, so omit a preference that says
// exactly that. This keeps pre-feature imports equivalent to an explicit reset
// instead of writing a row for every leg the user never touched.
export function replaceLegPreference(
  preferences: LegPreference[] | undefined,
  fromSpotId: string,
  toSpotId: string,
  mode: PersistedLegMode,
  options: Partial<Pick<LegPreference, "routeIndex" | "routeKey" | "timing" | "trafficAware">> = {},
): LegPreference[] {
  const withoutCurrent = (preferences ?? []).filter(
    (preference) => preference.fromSpotId !== fromSpotId || preference.toSpotId !== toSpotId,
  );
  const routeIndex = options.routeIndex ?? 0;
  const routeKey = options.routeKey;
  const trafficAware = mode === "DRIVE" && (options.trafficAware ?? false);
  // Arrive-by is transit-only, so switching away from transit must drop it
  // rather than persist a combination the schema rejects.
  const requested = options.timing ?? DEFAULT_LEG_TIMING;
  const timing: LegTiming = requested.kind === "ARRIVE_BY" && mode !== "TRANSIT" ? DEFAULT_LEG_TIMING : requested;

  const isDefault =
    mode === DEFAULT_LEG_MODE && routeIndex === 0 && routeKey == null && timing.kind === "AUTO" && !trafficAware;
  return isDefault
    ? withoutCurrent
    : [...withoutCurrent, { fromSpotId, toSpotId, mode, routeIndex, routeKey, timing, trafficAware }];
}

export function removeSpotLegPreferences(preferences: LegPreference[] | undefined, spotId: string): LegPreference[] {
  return (preferences ?? []).filter((preference) => preference.fromSpotId !== spotId && preference.toSpotId !== spotId);
}

// Resolve the saved choice against the routes actually returned. The
// fingerprint wins because Google may reorder alternatives between cache
// refreshes. The index is only a fallback for itineraries saved before keys
// existed, and a key that matches nothing falls back to the recommended route
// rather than presenting some other journey as the chosen one.
export function selectedRouteIndex(
  routes: Array<{ key?: string }> | undefined,
  preference: Pick<LegPreference, "routeIndex" | "routeKey">,
): number {
  if (!routes || routes.length === 0) return 0;
  if (preference.routeKey) {
    const matched = routes.findIndex((route) => route.key === preference.routeKey);
    return matched >= 0 ? matched : 0;
  }
  return Math.min(preference.routeIndex, routes.length - 1);
}

export function directDistanceMeters(from: Spot, to: Spot): number | null {
  if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) return null;
  const radians = Math.PI / 180;
  const latitudeDelta = (to.lat - from.lat) * radians;
  const longitudeDelta = (to.lng - from.lng) * radians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
