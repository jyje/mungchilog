import { useQuery } from "@tanstack/react-query";
import { computeLeg } from "../api";
import type { PersistedLegMode, Spot } from "../types";
import { routeDepartureIso } from "../schedule";

// Keep browser-persisted route data aligned with the server cache whenever
// route geometry changes. The same version is used by the server's cache key.
// Keep this in sync with apps/server/src/routes/legs.ts so a geometry/schema
// change invalidates both the browser query cache and the server cache.
const ROUTE_GEOMETRY_VERSION = "alternatives-v1";

// Shared by LegInfo (text summary) and RouteOverlay (map polyline) so
// both read from the same TanStack Query cache entry instead of firing
// the request twice.
export function useLeg(from: Spot, to: Spot, mode: PersistedLegMode, trafficAware: boolean, date: string, timezone: string) {
  const enabled = mode !== "DIRECT" && !!from.placeId && !!to.placeId;
  // Scheduled routes leave after the visit duration, using the trip's own
  // timezone. Unscheduled stops retain the stable noon fallback.
  const when = routeDepartureIso(date, from, timezone);

  return useQuery({
    queryKey: ["leg", from.placeId, to.placeId, mode, trafficAware, when, ROUTE_GEOMETRY_VERSION],
    queryFn: () => computeLeg(from.placeId!, to.placeId!, mode as Exclude<PersistedLegMode, "DIRECT">, when, timezone, trafficAware),
    enabled,
    staleTime: 1000 * 60 * 60 * 24 * 30, // matches the server's 30-day leg cache
  });
}
