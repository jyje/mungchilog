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
// bounding box: a bounding box needs a coordinate, and a Place ID-only
// endpoint has none. A trip's timezone is set once and already means "this
// trip is in Japan" for every other timing decision this server makes, so
// reusing it costs nothing new here.
//
// NAVITIME itself is coordinate-only (see toRequestCoordinate in
// navitime.ts), but a placeId endpoint usually carries coordinates too - a
// search-picked spot has both, and WaypointSchema now preserves the pair
// instead of the client (or this schema) discarding one. Checking for a
// coordinate here, not for the *absence* of a placeId, is what lets NAVITIME
// see those legs at all: almost every real spot comes from search, so
// requiring bare coordinates would have made this branch fire on map-dropped
// pins only.
export function resolveProvider(mode: TravelMode, timezone: string, endpoints: { from: Waypoint; to: Waypoint }): RouteProvider {
  const bothCoordinates = !!endpoints.from.latLng && !!endpoints.to.latLng;
  const wantsNavitime = mode === "TRANSIT" && timezone === "Asia/Tokyo" && bothCoordinates;
  if (wantsNavitime && navitimeRouteProvider.isConfigured()) return navitimeRouteProvider;
  return googleRouteProvider;
}
