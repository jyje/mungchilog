import type { TravelMode, Waypoint } from "../route-planning.js";
import { googleRouteProvider } from "./google.js";
import type { RouteProvider } from "./types.js";

// The one place a future provider switch gets decided. Today it always
// answers Google; adding a second provider (see the NAVITIME work tracked in
// this repo) or a region rule means editing this function only, never the
// /compute handler or the cache-key shape.
export function resolveProvider(_mode: TravelMode, _timezone: string, _endpoints: { from: Waypoint; to: Waypoint }): RouteProvider {
  return googleRouteProvider;
}
