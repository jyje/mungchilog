import type { RouteProviderId, RouteSegment, TransitRouteDetail, TravelMode, Waypoint } from "../route-planning.js";

export type { RouteProviderId };

// One returned alternative, in the shape the client already understands
// (apps/web/src/api.ts LegRoute). This is deliberately provider-neutral: a
// door-to-door NAVITIME journey (rail + bus + walk) fits the same fields as a
// Google Routes API journey, so adding a provider never touches the DB
// schema, the cache row shape, or the client's types.
export type ProviderRoute = {
  distanceM: number | null;
  durationS: number | null;
  fareAmount: number | null;
  fareCurrency: string | null;
  polyline: string | null;
  label: "DEFAULT_ROUTE" | "DEFAULT_ROUTE_ALTERNATE";
  departureTime: string | null;
  arrivalTime: string | null;
  transit: TransitRouteDetail[] | null;
  segments: RouteSegment[] | null;
  // Assigned by the caller via routeFingerprint(); providers return routes
  // without a key and the registry/handler stamps one on, identically for
  // every provider.
  key?: string;
};

export type RouteProviderResult = { routes: ProviderRoute[] };

export interface RouteProvider {
  id: RouteProviderId;
  // Whether this provider's required environment variable(s) are present.
  // Checked by the handler *before* calling fetchRoutes, so a missing key
  // reports the existing 501 "not configured" (an expected, temporary state -
  // see docs/google-maps-setup.md) rather than a 502 from a fetch that was
  // never going to succeed.
  isConfigured(): boolean;
  // Name of the environment variable isConfigured() is missing, surfaced in
  // the 501 response so it says what to set rather than just "no route".
  configHint: string;
  fetchRoutes(input: {
    from: Waypoint;
    to: Waypoint;
    mode: TravelMode;
    timing: { departureTime?: string; arrivalTime?: string };
    alternatives: boolean;
    trafficAware: boolean;
  }): Promise<RouteProviderResult>;
}
