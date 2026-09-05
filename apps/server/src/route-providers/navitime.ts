import type { TransitRouteDetail, Waypoint } from "../route-planning.js";
import { routeFingerprint } from "../route-planning.js";
import { encodeLineStringToPolyline } from "./polylineEncoding.js";
import type { ProviderRoute, RouteProvider } from "./types.js";

const DEFAULT_HOST = "navitime-route-totalnavi.p.rapidapi.com";

// NAVITIME's vehicle vocabulary (route_transit `sections[].move`) mapped onto
// the vocabulary apps/web/src/components/LegInfo.tsx's TransitVehicleIcon
// already understands (SUBWAY / BUS / TRAM / plain rail), so no client change
// is needed to render a NAVITIME-sourced route. Unrecognized values fall
// through to "TRAIN" - Japan's rail network is the safe default guess.
const VEHICLE_BY_MOVE: Record<string, string> = {
  local_train: "TRAIN",
  rapid_train: "TRAIN",
  superexpress_train: "TRAIN",
  express_train: "TRAIN",
  subway: "SUBWAY",
  monorail: "TRAM",
  tram: "TRAM",
  bus: "BUS",
  highway_bus: "BUS",
  sky_bus: "BUS",
};

type NavitimeMoveSection = {
  type: "move";
  move: string;
  line_name?: string;
  from_time?: string;
  to_time?: string;
  time?: number; // minutes
  distance?: number; // meters
};
type NavitimeSection = NavitimeMoveSection | { type: "point"; [key: string]: unknown };

type NavitimeItem = {
  summary: {
    time: number; // total minutes
    distance: number; // total meters
    fare?: { unit_0?: number };
  };
  sections: NavitimeSection[];
};

function isMoveSection(section: NavitimeSection): section is NavitimeMoveSection {
  return section.type === "move";
}

// The journey's own scheduled span - mirrors route-planning.ts's
// transitSchedule() but reads NAVITIME's field names. Walking sections carry
// no from_time/to_time-anchored schedule of their own; only the ride segments
// do, same reasoning as the Google side.
function navitimeSchedule(sections: NavitimeSection[]): { departureTime: string | null; arrivalTime: string | null } {
  const rides = sections.filter(isMoveSection).filter((section) => section.move !== "walk");
  const departures = rides.map((section) => section.from_time).filter((value): value is string => !!value).sort();
  const arrivals = rides.map((section) => section.to_time).filter((value): value is string => !!value).sort();
  return {
    departureTime: departures[0] ?? null,
    arrivalTime: arrivals[arrivals.length - 1] ?? null,
  };
}

function navitimeTransitDetails(sections: NavitimeSection[]): TransitRouteDetail[] | null {
  const details: TransitRouteDetail[] = [];
  for (const section of sections) {
    if (!isMoveSection(section) || section.move === "walk") continue;
    // NAVITIME's route_transit spec does not document a direction/headsign
    // field the way Google's transitDetails.headsign does - left null rather
    // than guessed at. A known, documented gap versus the Google provider.
    const detail = { vehicle: VEHICLE_BY_MOVE[section.move] ?? "TRAIN", line: section.line_name ?? null, headsign: null };
    const previous = details.at(-1);
    if (!previous || previous.vehicle !== detail.vehicle || previous.line !== detail.line) details.push(detail);
  }
  return details.length > 0 ? details : null;
}

// v1 scope: the whole-journey polyline comes from a second call to
// shape_transit (NAVITIME documents this as the geometry-bearing sibling of
// route_transit, not a flag on route_transit itself). Per-segment polylines
// (walk-to-station vs. the ride, the way Google's `segments` lets the map
// draw them differently) are deliberately left null here: matching each
// shape_transit LineString feature back to its own route_transit section
// needs verifying against a real response, which isn't possible without a
// provisioned API key (see the plan's "검증의 한계" note). A NAVITIME route
// still draws as a single whole-journey line, same as any old cache entry
// predating per-segment geometry.
async function fetchShapePolyline(host: string, apiKey: string, params: URLSearchParams): Promise<string | null> {
  const url = new URL(`https://${host}/shape_transit`);
  for (const [key, value] of params) url.searchParams.set(key, value);
  const res = await fetch(url, { headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": host } });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as {
    shapes?: { features?: Array<{ geometry?: { type?: string; coordinates?: Array<[number, number]> } }> };
  } | null;
  const features = data?.shapes?.features ?? [];
  const coordinates = features.flatMap((feature) =>
    feature.geometry?.type === "LineString" ? (feature.geometry.coordinates ?? []) : [],
  );
  return coordinates.length > 0 ? encodeLineStringToPolyline(coordinates) : null;
}

function toRequestCoordinate(waypoint: Waypoint): string {
  if (!("latLng" in waypoint)) throw new Error("NAVITIME provider requires coordinate endpoints");
  return `${waypoint.latLng.latitude},${waypoint.latLng.longitude}`;
}

export async function fetchNavitimeRoutes(
  apiKey: string,
  host: string,
  from: Waypoint,
  to: Waypoint,
  timing: { departureTime?: string; arrivalTime?: string },
): Promise<{ routes: ProviderRoute[] }> {
  const params = new URLSearchParams({
    start: toRequestCoordinate(from),
    goal: toRequestCoordinate(to),
    lang: "ko",
  });
  if (timing.arrivalTime) params.set("goal_time", timing.arrivalTime);
  else params.set("start_time", timing.departureTime ?? new Date().toISOString());

  const url = new URL(`https://${host}/route_transit`);
  for (const [key, value] of params) url.searchParams.set(key, value);
  const res = await fetch(url, { headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": host } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NAVITIME route_transit ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { items?: NavitimeItem[] };
  if (!data.items?.length) throw new Error("NAVITIME returned no routes");

  const polyline = await fetchShapePolyline(host, apiKey, params).catch(() => null);

  return {
    routes: data.items.slice(0, 4).map((item, index) => {
      const schedule = navitimeSchedule(item.sections);
      const summary = {
        distanceM: item.summary.distance ?? null,
        durationS: item.summary.time != null ? Math.round(item.summary.time * 60) : null,
        fareAmount: item.summary.fare?.unit_0 ?? null,
        // NAVITIME only covers Japan, so the currency is never ambiguous.
        fareCurrency: item.summary.fare?.unit_0 != null ? "JPY" : null,
        polyline: index === 0 ? polyline : null,
        // No Google-style route-label concept; approximate by position -
        // the first item is NAVITIME's own top recommendation.
        label: (index === 0 ? "DEFAULT_ROUTE" : "DEFAULT_ROUTE_ALTERNATE") as "DEFAULT_ROUTE" | "DEFAULT_ROUTE_ALTERNATE",
        departureTime: schedule.departureTime,
        arrivalTime: schedule.arrivalTime,
        transit: navitimeTransitDetails(item.sections),
      };
      // segments stays null for the reason in fetchShapePolyline's comment -
      // never fed into routeFingerprint either way (same rule as the Google
      // provider: geometry never participates in the journey's identity).
      return { ...summary, key: routeFingerprint(summary), segments: null };
    }),
  };
}

export const navitimeRouteProvider: RouteProvider = {
  id: "navitime",
  configHint: "NAVITIME_API_KEY",
  isConfigured() {
    return !!process.env.NAVITIME_API_KEY;
  },
  async fetchRoutes({ from, to, timing }) {
    const apiKey = process.env.NAVITIME_API_KEY;
    if (!apiKey) throw new Error("NAVITIME_API_KEY not configured");
    const host = process.env.NAVITIME_API_HOST || DEFAULT_HOST;
    return fetchNavitimeRoutes(apiKey, host, from, to, timing);
  },
};
