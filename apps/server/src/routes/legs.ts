import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, requireApproved, type AuthEnv } from "../auth.js";

export const legs = new Hono<AuthEnv>();
// Not trip-scoped (keyed by placeId pairs, cached across all trips), so
// just login+approval is required here - no per-trip membership check.
legs.use("*", requireAuth, requireApproved);

const TRAVEL_MODES = ["DRIVE", "WALK", "BICYCLE", "TRANSIT", "TWO_WHEELER"] as const;
// A route shape is cached alongside its journey summary. Bump this whenever
// the requested geometry changes so an old overview polyline cannot conceal a
// newly available, more accurate route for the entire 30-day TTL.
const ROUTE_GEOMETRY_VERSION = "alternatives-v1";

const ComputeLegSchema = z.object({
  fromPlaceId: z.string(),
  toPlaceId: z.string(),
  mode: z.enum(TRAVEL_MODES),
  alternatives: z.boolean().default(true),
  trafficAware: z.boolean().default(false),
  // ISO 8601. Defaults to "now": only matters for picking the cache
  // bucket and (for TRANSIT) which timetable Google quotes.
  when: z.string().datetime().optional(),
  // IANA timezone name the cache bucket's weekday/hour are computed in -
  // should be the trip's own timezone (destination), not the server's
  // or the caller's. Not locked to any one region.
  timezone: z.string().default("Asia/Tokyo"),
});

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, per PLAN.md's caching policy
const TRAFFIC_TTL_MS = 5 * 60 * 1000;

type LegRow = {
  id: string;
  distance_m: number | null;
  duration_s: number | null;
  fare_amount: number | null;
  fare_currency: string | null;
  polyline: string | null;
  routes_json: string | null;
  fetched_at: string;
};

// (day-of-week, 4-hour-of-day block) in the trip's own timezone: coarse
// enough that a handful of trip days share cache entries, fine enough
// that morning vs. evening transit schedules don't collide.
function bucketFor(when: Date, timezone: string): string {
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

function cacheKey(fromPlaceId: string, toPlaceId: string, mode: string, bucket: string, trafficAware: boolean): string {
  return `${fromPlaceId}:${toPlaceId}:${mode}:${bucket}:${trafficAware ? "traffic" : "standard"}:${ROUTE_GEOMETRY_VERSION}`;
}

legs.post("/compute", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (body === null) return c.json({ error: "invalid JSON body" }, 400);

  const parsed = ComputeLegSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);

  const { fromPlaceId, toPlaceId, mode, timezone, alternatives, trafficAware } = parsed.data;
  if (trafficAware && mode !== "DRIVE") return c.json({ error: "traffic-aware routing is only available for driving legs" }, 400);
  const when = parsed.data.when ? new Date(parsed.data.when) : new Date();
  const bucket = bucketFor(when, timezone);
  const id = cacheKey(fromPlaceId, toPlaceId, mode, bucket, trafficAware);
  const ttl = trafficAware ? TRAFFIC_TTL_MS : TTL_MS;

  const cached = await db.get<LegRow>("SELECT * FROM legs WHERE id = ?", [id]);
  if (cached && Date.now() - Date.parse(cached.fetched_at) < ttl) {
    return c.json(toLegResponse(cached), 200, { "X-Cache": "hit" });
  }

  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!apiKey) {
    // Not a real 500: this is an expected, temporary state until the
    // Maps API keys are provisioned (see TASK.md blockers).
    return c.json(
      { error: "GOOGLE_MAPS_SERVER_API_KEY not configured", cached: cached ? toLegResponse(cached) : null },
      501,
    );
  }

  let fetched;
  try {
    fetched = await callRoutesApi(apiKey, fromPlaceId, toPlaceId, mode, when, alternatives, trafficAware);
  } catch (e) {
    // Serve a stale cache entry rather than nothing, if one exists.
    if (cached) return c.json(toLegResponse(cached), 200, { "X-Cache": "stale" });
    return c.json({ error: String((e as Error).message ?? e) }, 502);
  }

  const now = new Date().toISOString();
  const primary = fetched.routes[0];
  await db.run(
    `INSERT INTO legs (id, from_place_id, to_place_id, mode, bucket, distance_m, duration_s, fare_amount, fare_currency, polyline, routes_json, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       distance_m = excluded.distance_m,
       duration_s = excluded.duration_s,
       fare_amount = excluded.fare_amount,
       fare_currency = excluded.fare_currency,
       polyline = excluded.polyline,
       routes_json = excluded.routes_json,
       fetched_at = excluded.fetched_at`,
    [
      id,
      fromPlaceId,
      toPlaceId,
      mode,
      bucket,
      primary?.distanceM ?? null,
      primary?.durationS ?? null,
      primary?.fareAmount ?? null,
      primary?.fareCurrency ?? null,
      primary?.polyline ?? null,
      JSON.stringify(fetched.routes),
      now,
    ],
  );

  return c.json(
    { fromPlaceId, toPlaceId, mode, routes: fetched.routes, fetchedAt: now },
    200,
    { "X-Cache": "miss" },
  );
});

function toLegResponse(row: LegRow) {
  const fallback = [{
    distanceM: row.distance_m,
    durationS: row.duration_s,
    fareAmount: row.fare_amount,
    fareCurrency: row.fare_currency,
    polyline: row.polyline,
    label: "DEFAULT_ROUTE",
  }];
  let routes = fallback;
  try {
    const parsed = row.routes_json ? JSON.parse(row.routes_json) : null;
    if (Array.isArray(parsed) && parsed.length > 0) routes = parsed;
  } catch {
    // A malformed legacy cache entry should not prevent the basic route from
    // being served. The next cache refresh replaces it.
  }
  return {
    routes,
    fetchedAt: row.fetched_at,
  };
}

// NOTE: written against the documented Routes API v2 `computeRoutes`
// contract but not yet exercised against a live key (see TASK.md: the
// key is a user-provided blocker). Verify field names against a real
// response once the key exists; Google does occasionally rename fields
// across API versions.
async function callRoutesApi(
  apiKey: string,
  fromPlaceId: string,
  toPlaceId: string,
  mode: (typeof TRAVEL_MODES)[number],
  when: Date,
  alternatives: boolean,
  trafficAware: boolean,
) {
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.travelAdvisory.transitFare,routes.routeLabels",
    },
    body: JSON.stringify({
      origin: { placeId: fromPlaceId },
      destination: { placeId: toPlaceId },
      travelMode: mode,
      ...(mode === "TRANSIT" || trafficAware ? { departureTime: when.toISOString() } : {}),
      ...(alternatives ? { computeAlternativeRoutes: true } : {}),
      ...(trafficAware ? { routingPreference: "TRAFFIC_AWARE" } : {}),
      // OVERVIEW is the API default and can reduce a short urban route to
      // only a few straight segments. This application renders the route on
      // an interactive map, so retain the official road and rail geometry.
      polylineQuality: "HIGH_QUALITY",
      polylineEncoding: "ENCODED_POLYLINE",
      // languageCode is the user's language preference, not tied to the
      // destination. No regionCode - every call here uses placeId, which
      // is already unambiguous, so region biasing has nothing to do.
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
    }>;
  };

  if (!data.routes?.length) throw new Error("Routes API returned no routes");
  return {
    routes: data.routes.slice(0, 4).map((route) => {
      const fare = route.travelAdvisory?.transitFare;
      return {
        distanceM: route.distanceMeters ?? null,
        durationS: route.duration ? Number(route.duration.replace(/s$/, "")) : null,
        fareAmount: fare?.units != null ? Number(fare.units) : null,
        fareCurrency: fare?.currencyCode ?? null,
        polyline: route.polyline?.encodedPolyline ?? null,
        label: route.routeLabels?.includes("DEFAULT_ROUTE_ALTERNATE") ? "DEFAULT_ROUTE_ALTERNATE" : "DEFAULT_ROUTE",
      };
    }),
  };
}
