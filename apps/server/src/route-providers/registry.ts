import type { TravelMode, Waypoint } from "../route-planning.js";
import { googleRouteProvider } from "./google.js";
import { navitimeRouteProvider } from "./navitime.js";
import type { RouteProvider } from "./types.js";

// The one place a future provider switch gets decided. Today it is a single
// branch (Japan TRANSIT -> NAVITIME, everything else -> Google); adding a
// third provider or a different region rule means editing this function
// only, not the /compute handler or the cache-key shape.
//
// Region is read off the trip's own `timezone` (already part of every
// /api/legs/compute request, see routes/legs.ts) rather than a coordinate
// bounding box: a bounding box needs a coordinate, and a Place ID endpoint
// has none. A trip's timezone is set once and already means "this trip is in
// Japan" for every other timing decision this server makes, so reusing it
// costs nothing new here. NAVITIME itself is coordinate-only (see
// toRequestCoordinate in navitime.ts), so a placeId leg still falls through
// to Google below even when the timezone matches - a known limitation, not
// an oversight.
export function resolveProvider(mode: TravelMode, timezone: string, endpoints: { from: Waypoint; to: Waypoint }): RouteProvider {
  const bothCoordinates = "latLng" in endpoints.from && "latLng" in endpoints.to;
  const wantsNavitime = mode === "TRANSIT" && timezone === "Asia/Tokyo" && bothCoordinates;
  if (wantsNavitime && navitimeRouteProvider.isConfigured()) return navitimeRouteProvider;
  return googleRouteProvider;
}
