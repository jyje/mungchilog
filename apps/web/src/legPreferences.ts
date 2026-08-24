import type { LegPreference, PersistedLegMode, Spot } from "./types";

export const DEFAULT_LEG_MODE: PersistedLegMode = "TRANSIT";

export const LEG_MODE_OPTIONS: Array<{ mode: PersistedLegMode; label: string; description: string }> = [
  { mode: "DIRECT", label: "직선", description: "두 장소를 직선으로 연결" },
  { mode: "TRANSIT", label: "대중교통", description: "대중교통 경로" },
  { mode: "DRIVE", label: "운전", description: "도로 경로" },
  { mode: "WALK", label: "도보", description: "보행 경로" },
];

export function legModeFor(preferences: LegPreference[] | undefined, fromSpotId: string, toSpotId: string): PersistedLegMode {
  return preferences?.find((preference) => preference.fromSpotId === fromSpotId && preference.toSpotId === toSpotId)?.mode ?? DEFAULT_LEG_MODE;
}

// TRANSIT is the legacy/default behavior, so omit it from persisted data.
// This keeps imports from before the feature equivalent to an explicit reset.
export function replaceLegPreference(
  preferences: LegPreference[] | undefined,
  fromSpotId: string,
  toSpotId: string,
  mode: PersistedLegMode,
): LegPreference[] {
  const withoutCurrent = (preferences ?? []).filter(
    (preference) => preference.fromSpotId !== fromSpotId || preference.toSpotId !== toSpotId,
  );
  return mode === DEFAULT_LEG_MODE ? withoutCurrent : [...withoutCurrent, { fromSpotId, toSpotId, mode }];
}

export function removeSpotLegPreferences(preferences: LegPreference[] | undefined, spotId: string): LegPreference[] {
  return (preferences ?? []).filter((preference) => preference.fromSpotId !== spotId && preference.toSpotId !== spotId);
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
