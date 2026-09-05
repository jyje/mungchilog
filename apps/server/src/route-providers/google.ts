import {
  routeFingerprint,
  routeSegments,
  toRoutesApiWaypoint,
  transitRouteDetails,
  transitSchedule,
  type TravelMode,
  type Waypoint,
} from "../route-planning.js";
import type { ProviderRoute, RouteProvider } from "./types.js";

type ApiStep = {
  travelMode?: string;
  polyline?: { encodedPolyline?: string };
  transitDetails?: {
    stopDetails?: { departureTime?: string; arrivalTime?: string };
    headsign?: string;
    transitLine?: {
      name?: string;
      nameShort?: string;
      vehicle?: { type?: string };
    };
  };
};
type ApiLeg = { steps?: ApiStep[] };

// Google occasionally answers a TRANSIT request with HTTP 200 and a route
// made entirely of WALK steps - not an error, not ZERO_RESULTS, just a
// walking substitute presented as if it were the requested mode. Confirmed
// live against Hankyu Umeda Main Store -> Kitahama Retro Building (Osaka):
// a 200 response, 13 walking steps, zero TRANSIT steps, no train or bus that
// genuinely exists on that corridor. transitRouteDetails() already returns
// null when a route has no TRANSIT step, so that's the whole check - reject
// rather than cache and draw a route that was never actually transit.
function isViableTransitRoute(mode: TravelMode, legs: ApiLeg[] | undefined): boolean {
  return mode !== "TRANSIT" || transitRouteDetails(legs) !== null;
}

// NOTE: written against the documented Routes API v2 `computeRoutes`
// contract. Exported (only) so the live e2e suite (src/e2e/) can exercise
// this exact code path against the real API - not a reimplementation.
export async function fetchGoogleRoutes(
  apiKey: string,
  from: Waypoint,
  to: Waypoint,
  mode: TravelMode,
  timing: { departureTime?: string; arrivalTime?: string },
  alternatives: boolean,
  trafficAware: boolean,
): Promise<{ routes: ProviderRoute[] }> {
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      // Transit stop times are what make two departures on the same line
      // distinguishable; without them their fingerprints collide (see
      // routeFingerprint). Requested only for transit, since every extra
      // field is response weight on a mode that would never populate it.
      "X-Goog-FieldMask": [
        "routes.duration",
        "routes.distanceMeters",
        "routes.polyline.encodedPolyline",
        "routes.travelAdvisory.transitFare",
        "routes.routeLabels",
        // Per-step geometry and mode, which is what lets the map draw the walk
        // to the station differently from the ride. Transit only: a walk or
        // drive leg is uniform by definition, so asking for its steps would be
        // response weight buying nothing.
        ...(mode === "TRANSIT"
          ? [
              "routes.legs.steps.transitDetails.stopDetails",
              "routes.legs.steps.transitDetails.transitLine",
              "routes.legs.steps.transitDetails.headsign",
              "routes.legs.steps.polyline.encodedPolyline",
              "routes.legs.steps.travelMode",
            ]
          : []),
      ].join(","),
    },
    body: JSON.stringify({
      origin: toRoutesApiWaypoint(from),
      destination: toRoutesApiWaypoint(to),
      travelMode: mode,
      // Exactly one of departureTime / arrivalTime, or neither - Google
      // rejects a request carrying both (see resolveTiming).
      ...timing,
      ...(alternatives ? { computeAlternativeRoutes: true } : {}),
      ...(trafficAware ? { routingPreference: "TRAFFIC_AWARE" } : {}),
      // OVERVIEW is the API default and can reduce a short urban route to
      // only a few straight segments. This application renders the route on
      // an interactive map, so retain the official road and rail geometry.
      polylineQuality: "HIGH_QUALITY",
      polylineEncoding: "ENCODED_POLYLINE",
      // languageCode is the user's language preference, not tied to the
      // destination. No regionCode - a placeId is already unambiguous, and a
      // coordinate endpoint is literal, so region biasing has nothing to do.
      languageCode: "ko",
      units: "METRIC",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Routes API ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    routes?: Array<{
      duration?: string; // e.g. "1234s"
      distanceMeters?: number;
      polyline?: { encodedPolyline?: string };
      travelAdvisory?: { transitFare?: { units?: string; currencyCode?: string } };
      routeLabels?: string[];
      legs?: ApiLeg[];
    }>;
  };

  const viable = (data.routes ?? []).filter((route) => isViableTransitRoute(mode, route.legs));
  if (viable.length === 0) throw new Error("Routes API returned no routes");

  return {
    routes: viable.slice(0, 4).map((route) => {
      const fare = route.travelAdvisory?.transitFare;
      const schedule = transitSchedule(route.legs);
      const summary = {
        distanceM: route.distanceMeters ?? null,
        durationS: route.duration ? Number(route.duration.replace(/s$/, "")) : null,
        fareAmount: fare?.units != null ? Number(fare.units) : null,
        fareCurrency: fare?.currencyCode ?? null,
        polyline: route.polyline?.encodedPolyline ?? null,
        label: (route.routeLabels?.includes("DEFAULT_ROUTE_ALTERNATE") ? "DEFAULT_ROUTE_ALTERNATE" : "DEFAULT_ROUTE") as
          | "DEFAULT_ROUTE"
          | "DEFAULT_ROUTE_ALTERNATE",
        // Null on non-transit modes, and on a transit route whose steps are
        // all walking. Both are fine: shape and duration already identify
        // those, and the schedule only has to break ties it cannot.
        departureTime: schedule.departureTime,
        arrivalTime: schedule.arrivalTime,
        transit: transitRouteDetails(route.legs),
      };
      // `segments` is attached AFTER the fingerprint, and is deliberately not
      // part of `summary`. routeFingerprint hashes the journey's identity;
      // feeding it geometry we only just started requesting would change every
      // key, and every saved alternative would silently snap back to the
      // recommended route with nothing reported anywhere.
      return { ...summary, key: routeFingerprint(summary), segments: routeSegments(route.legs) };
    }),
  };
}

export const googleRouteProvider: RouteProvider = {
  id: "google",
  configHint: "GOOGLE_MAPS_SERVER_API_KEY",
  isConfigured() {
    return !!process.env.GOOGLE_MAPS_SERVER_API_KEY;
  },
  async fetchRoutes({ from, to, mode, timing, alternatives, trafficAware }) {
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_MAPS_SERVER_API_KEY not configured");
    return fetchGoogleRoutes(apiKey, from, to, mode, timing, alternatives, trafficAware);
  },
};
