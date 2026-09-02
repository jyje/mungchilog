import { useQuery } from "@tanstack/react-query";
import { computeLeg, type LegWaypoint } from "../api";
import { resolveLegAnchor } from "../legTiming";
import { isLegacyLegMode } from "../legPreferences";
import type { LegTiming, PersistedLegMode, Spot } from "../types";

// Keep browser-persisted route data aligned with the server cache whenever
// route geometry, endpoint encoding, or timing semantics change. Keep this in
// sync with ROUTE_GEOMETRY_VERSION in apps/server/src/route-planning.ts so a
// change invalidates both the browser query cache and the server cache.
const ROUTE_GEOMETRY_VERSION = "route-segments-v5";

// A Place ID is preferred where one exists: it survives a venue moving a few
// metres and lets Google snap to the right entrance. A map-picked stop has
// only coordinates, and is still perfectly routable.
export function waypointForSpot(spot: Spot): LegWaypoint | null {
  if (spot.placeId) return { placeId: spot.placeId };
  if (spot.lat != null && spot.lng != null) return { latLng: { latitude: spot.lat, longitude: spot.lng } };
  return null;
}

// Shared by LegInfo (text summary) and RouteOverlay (map polyline) so
// both read from the same TanStack Query cache entry instead of firing
// the request twice.
export function useLeg(
  from: Spot,
  to: Spot,
  mode: PersistedLegMode,
  trafficAware: boolean,
  date: string,
  timezone: string,
  timing: LegTiming,
) {
  const fromWaypoint = waypointForSpot(from);
  const toWaypoint = waypointForSpot(to);
  // A legacy DIRECT leg has no provider route to fetch - it stays a straight
  // line until the user picks a real mode.
  const enabled = !isLegacyLegMode(mode) && !!fromWaypoint && !!toWaypoint;

  const anchor = resolveLegAnchor(from, timing, date, timezone);

  return useQuery({
    queryKey: ["leg", fromWaypoint, toWaypoint, mode, trafficAware, anchor.when, timing.kind, ROUTE_GEOMETRY_VERSION],
    queryFn: () =>
      computeLeg({
        from: fromWaypoint!,
        to: toWaypoint!,
        mode: mode as Exclude<PersistedLegMode, "DIRECT">,
        when: anchor.when,
        timingKind: timing.kind,
        timezone,
        trafficAware,
      }),
    enabled,
    // Traffic-aware driving is deliberately short-lived: presenting a
    // half-hour-old estimate as live traffic would be a lie. Everything else
    // keeps the long cache the server also uses.
    staleTime: trafficAware ? 1000 * 60 * 5 : 1000 * 60 * 60 * 24 * 30,
  });
}
