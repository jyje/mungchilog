import { createHash } from "node:crypto";
import { z } from "zod";

// Pure routing helpers shared by the /api/legs/compute handler. Kept out of
// the handler (and at src/ level, where `npm test` picks up its test file) so
// endpoint identity, timing rules, and cache keys can be verified without a
// database, an HTTP server, or a Google API key.

// The provider modes this server is willing to request. The web UI offers a
// narrower set (walk/transit/drive per issue 48); bicycle and two-wheeler stay
// reachable for importers and future clients rather than being deleted here.
export const TRAVEL_MODES = ["DRIVE", "WALK", "BICYCLE", "TRANSIT", "TWO_WHEELER"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

// Which backend actually answers a route request (see route-providers/). Owned
// here, not in route-providers/types.ts, so cacheKey can reference it without
// a route-planning <-> route-providers import cycle.
export const ROUTE_PROVIDER_IDS = ["google", "navitime"] as const;
export type RouteProviderId = (typeof ROUTE_PROVIDER_IDS)[number];

// A route shape is cached alongside its journey summary. Bump this whenever
// the requested geometry, the endpoint encoding, or the timing semantics
// change, so an old cache entry cannot conceal a newly correct route for the
// entire 30-day TTL. Keep in sync with apps/web/src/hooks/useLeg.ts.
//
// v6: cacheKey() now includes the provider id. Once a second provider
// (NAVITIME) can answer the same (from, to, mode), a Google-served cache row
// and a NAVITIME-served one must never share a slot - they are genuinely
// different answers, not interchangeable cache hits.
export const ROUTE_GEOMETRY_VERSION = "route-segments-v6";

// An endpoint carries a Place ID, a bare coordinate, or both. Coordinates
// alone are what make map-picked stops (issue 46) routable - they have no
// placeId. Both together is what a search-picked spot actually has (Places
// resolves and stores lat/lng regardless of whether the caller later asks by
// placeId), and it matters: Google is precise from a placeId alone, but
// NAVITIME is coordinate-only (see toRequestCoordinate in navitime.ts) and
// used to be starved of every placeId-based leg even when the spot's
// coordinates were sitting right there in the same request.
export const WaypointSchema = z
  .object({
    placeId: z.string().min(1).optional(),
    latLng: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
      .optional(),
  })
  .refine((value) => value.placeId != null || value.latLng != null, {
    message: "a waypoint needs a placeId, coordinates, or both",
  });
export type Waypoint = z.infer<typeof WaypointSchema>;

// AUTO and DEPART_AT both resolve to a departure instant; they differ only in
// whether the user chose it, which the cache key must still distinguish so a
// deliberate time never reads a bucket filled by a derived one.
export const TIMING_KINDS = ["AUTO", "DEPART_AT", "ARRIVE_BY"] as const;
export type TimingKind = (typeof TIMING_KINDS)[number];

// Identity comes from the placeId when there is one, even if coordinates also
// ride along: a venue's placeId survives it moving a few metres, so keying on
// that (rather than on coordinates that might now differ slightly per
// provider) is what makes the cache slot stable.
export function waypointRef(waypoint: Waypoint): string {
  if (waypoint.placeId) return `place:${waypoint.placeId}`;
  // ~1e-6 deg is a few centimetres: far finer than any stop a person places by
  // hand, and fixed precision keeps 35.1 and 35.100000 in the same cache slot.
  const { latitude, longitude } = waypoint.latLng!; // the schema's refine guarantees one of the two
  return `ll:${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

// Routes API v2 spells a coordinate endpoint `location.latLng`, but a Place ID
// endpoint is `placeId` at the top level, not nested under `location`. Google
// gets the placeId when there is one - it geocodes more precisely from that
// than from the coordinate Places already resolved it to.
export function toRoutesApiWaypoint(waypoint: Waypoint): Record<string, unknown> {
  return waypoint.placeId ? { placeId: waypoint.placeId } : { location: { latLng: waypoint.latLng } };
}

// (day-of-week, 4-hour-of-day block) in the trip's own timezone: coarse
// enough that a handful of trip days share cache entries, fine enough
// that morning vs. evening transit schedules don't collide.
export function bucketFor(when: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(when);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Unk";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  return `${weekday}-${Math.floor(hour / 4)}`;
}

export function cacheKey(input: {
  fromRef: string;
  toRef: string;
  mode: TravelMode;
  bucket: string;
  timingKind: TimingKind;
  alternatives: boolean;
  trafficAware: boolean;
  provider: RouteProviderId;
}): string {
  return [
    input.fromRef,
    input.toRef,
    input.mode,
    input.bucket,
    input.timingKind,
    input.alternatives ? "alternatives" : "primary",
    input.trafficAware ? "traffic" : "standard",
    input.provider,
    ROUTE_GEOMETRY_VERSION,
  ].join("|");
}

// A stable identity for one returned alternative. The persisted selection
// stores this instead of an array index: Google may reorder or drop
// alternatives between cache refreshes, and an index would then silently
// point at a different journey than the one the user chose.
//
// Shape alone does not identify a transit journey. Two departures on the same
// line share a polyline, a duration, and a distance, and differ only in when
// they leave, so the schedule has to participate or the 10:00 and the 10:30
// bus collapse into one key and the saved choice snaps back to whichever the
// provider happens to list first.
export function routeFingerprint(route: {
  polyline?: string | null;
  durationS?: number | null;
  distanceM?: number | null;
  departureTime?: string | null;
  arrivalTime?: string | null;
}): string {
  const material = [
    route.polyline ?? "",
    route.durationS ?? "",
    route.distanceM ?? "",
    route.departureTime ?? "",
    route.arrivalTime ?? "",
  ].join("|");
  return createHash("sha1").update(material).digest("hex").slice(0, 16);
}

export class RouteRequestError extends Error {}

// Google rejects a request carrying both departureTime and arrivalTime, and
// accepts arrivalTime only for transit. Reject those here with a specific
// message rather than forwarding a request we know is invalid.
export function resolveTiming(input: {
  mode: TravelMode;
  timingKind: TimingKind;
  when: Date;
  trafficAware: boolean;
}): { departureTime?: string; arrivalTime?: string } {
  if (input.timingKind === "ARRIVE_BY") {
    if (input.mode !== "TRANSIT") {
      throw new RouteRequestError("arrive-by timing is only available for transit legs");
    }
    return { arrivalTime: input.when.toISOString() };
  }
  // Departure time is meaningful only where it changes the answer: a transit
  // timetable, or a traffic-aware driving estimate. Sending it for a walk adds
  // nothing and needlessly narrows the cache bucket's reuse.
  if (input.mode === "TRANSIT" || input.trafficAware) {
    return { departureTime: input.when.toISOString() };
  }
  return {};
}

// --- Routes API response parsing -------------------------------------------
// Pure, so it can be tested without a network call or an API key. The handler
// that owns the fetch (routes/legs.ts) does not export anything.

/** One drawable piece of a journey, in the order it is travelled. */
export type RouteSegment = {
  travelMode: "WALK" | "TRANSIT" | "DRIVE" | "OTHER";
  polyline: string;
};

export type TransitRouteDetail = {
  vehicle: string | null;
  line: string | null;
  headsign: string | null;
};

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

// The journey's own boundaries: when the first vehicle leaves and when the
// last one lands. Walking steps carry no transitDetails and are skipped, so
// this is the scheduled part of the trip rather than the door-to-door span.
export function transitSchedule(legs: ApiLeg[] | undefined): {
  departureTime: string | null;
  arrivalTime: string | null;
} {
  const departures: string[] = [];
  const arrivals: string[] = [];
  for (const leg of legs ?? []) {
    for (const step of leg.steps ?? []) {
      const stop = step.transitDetails?.stopDetails;
      if (stop?.departureTime) departures.push(stop.departureTime);
      if (stop?.arrivalTime) arrivals.push(stop.arrivalTime);
    }
  }
  departures.sort();
  arrivals.sort();
  return {
    departureTime: departures[0] ?? null,
    arrivalTime: arrivals[arrivals.length - 1] ?? null,
  };
}

// Keep the list summary compact: it needs each vehicle the traveller boards,
// not the walking access steps surrounding a transfer.
export function transitRouteDetails(legs: ApiLeg[] | undefined): TransitRouteDetail[] | null {
  const details: TransitRouteDetail[] = [];
  for (const leg of legs ?? []) {
    for (const step of leg.steps ?? []) {
      if (step.travelMode !== "TRANSIT") continue;
      const transit = step.transitDetails;
      const detail = {
        vehicle: transit?.transitLine?.vehicle?.type ?? null,
        line: transit?.transitLine?.nameShort ?? transit?.transitLine?.name ?? null,
        headsign: transit?.headsign ?? null,
      };
      const previous = details.at(-1);
      if (!previous || previous.vehicle !== detail.vehicle || previous.line !== detail.line || previous.headsign !== detail.headsign) {
        details.push(detail);
      }
    }
  }
  return details.length > 0 ? details : null;
}

/**
 * Per-step geometry, which is the only way to tell the walk to the station
 * from the ride once they are drawn on a map.
 *
 * Returns null rather than [] when nothing usable came back, so "we did not
 * ask for steps" and "the provider sent none" look identical to the client -
 * both mean "draw the whole-journey line instead".
 */
export function routeSegments(legs: ApiLeg[] | undefined): RouteSegment[] | null {
  const segments: RouteSegment[] = [];
  for (const leg of legs ?? []) {
    for (const step of leg.steps ?? []) {
      const polyline = step.polyline?.encodedPolyline;
      if (!polyline) continue;
      const mode = step.travelMode;
      segments.push({
        // Anything that is not plainly walking is drawn as riding. Bicycle and
        // two-wheeler legs reach this through imports, and drawing them as
        // walking would be a lie.
        travelMode: mode === "WALK" || mode === "TRANSIT" || mode === "DRIVE" ? mode : "OTHER",
        polyline,
      });
    }
  }
  return segments.length > 0 ? segments : null;
}
