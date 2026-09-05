import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, requireApproved, type AuthEnv } from "../auth.js";
import {
  bucketFor,
  cacheKey,
  resolveTiming,
  RouteRequestError,
  routeFingerprint,
  TIMING_KINDS,
  TRAVEL_MODES,
  type Waypoint,
  WaypointSchema,
  waypointRef,
} from "../route-planning.js";
import { resolveProvider } from "../route-providers/registry.js";

export const legs = new Hono<AuthEnv>();
// Not trip-scoped (keyed by endpoint pairs, cached across all trips), so
// just login+approval is required here - no per-trip membership check.
legs.use("*", requireAuth, requireApproved);

const ComputeLegSchema = z
  .object({
    // Preferred endpoint form: a Place ID or a bare coordinate.
    from: WaypointSchema.optional(),
    to: WaypointSchema.optional(),
    // Legacy fields kept readable so a browser still running the previous
    // bundle keeps routing while the new one rolls out.
    fromPlaceId: z.string().min(1).optional(),
    toPlaceId: z.string().min(1).optional(),
    mode: z.enum(TRAVEL_MODES),
    alternatives: z.boolean().default(true),
    trafficAware: z.boolean().default(false),
    timingKind: z.enum(TIMING_KINDS).default("AUTO"),
    // ISO 8601. Interpreted as a departure instant unless timingKind is
    // ARRIVE_BY. Defaults to "now".
    when: z.string().datetime().optional(),
    // IANA timezone name the cache bucket's weekday/hour are computed in -
    // should be the trip's own timezone (destination), not the server's
    // or the caller's. Not locked to any one region. Also what
    // route-providers/registry.ts reads to decide whether a Japan-only
    // provider (NAVITIME) applies to this leg.
    timezone: z.string().default("Asia/Tokyo"),
  })
  .transform((body, ctx) => {
    const from = body.from ?? (body.fromPlaceId ? { placeId: body.fromPlaceId } : null);
    const to = body.to ?? (body.toPlaceId ? { placeId: body.toPlaceId } : null);
    if (!from || !to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from and to endpoints are required" });
      return z.NEVER;
    }
    return { ...body, from: from as Waypoint, to: to as Waypoint };
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

legs.post("/compute", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (body === null) return c.json({ error: "invalid JSON body" }, 400);

  const parsed = ComputeLegSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);

  const { from, to, mode, timezone, alternatives, trafficAware, timingKind } = parsed.data;
  if (trafficAware && mode !== "DRIVE") return c.json({ error: "traffic-aware routing is only available for driving legs" }, 400);

  const when = parsed.data.when ? new Date(parsed.data.when) : new Date();
  let timing;
  try {
    timing = resolveTiming({ mode, timingKind, when, trafficAware });
  } catch (e) {
    if (e instanceof RouteRequestError) return c.json({ error: e.message }, 400);
    throw e;
  }

  const provider = resolveProvider(mode, timezone, { from, to });
  const fromRef = waypointRef(from);
  const toRef = waypointRef(to);
  const bucket = bucketFor(when, timezone);
  const id = cacheKey({ fromRef, toRef, mode, bucket, timingKind, alternatives, trafficAware, provider: provider.id });
  // Traffic-aware driving is the only route whose answer goes stale in
  // minutes. Everything else keeps the long TTL, so a cached entry is never
  // presented as live traffic after its short window has passed.
  const ttl = trafficAware ? TRAFFIC_TTL_MS : TTL_MS;

  const cached = await db.get<LegRow>("SELECT * FROM legs WHERE id = ?", [id]);
  if (cached && Date.now() - Date.parse(cached.fetched_at) < ttl) {
    return c.json(toLegResponse(cached), 200, { "X-Cache": "hit" });
  }

  if (!provider.isConfigured()) {
    // Not a real 500: this is an expected, temporary state until the
    // relevant API key is provisioned (see docs/google-maps-setup.md and
    // docs/navitime-setup.md).
    return c.json(
      { error: `${provider.configHint} not configured`, cached: cached ? toLegResponse(cached) : null },
      501,
    );
  }

  let fetched;
  try {
    fetched = await provider.fetchRoutes({ from, to, mode, timing, alternatives, trafficAware });
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
      // These columns predate coordinate endpoints and are diagnostic only -
      // the cache identity lives in `id`. They now hold the endpoint ref
      // ("place:X" or "ll:lat,lng") so a coordinate leg stays representable
      // without a migration on a NOT NULL column.
      fromRef,
      toRef,
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

  return c.json({ routes: fetched.routes, fetchedAt: now }, 200, { "X-Cache": "miss" });
});

function toLegResponse(row: LegRow) {
  const fallback = [{
    distanceM: row.distance_m,
    durationS: row.duration_s,
    fareAmount: row.fare_amount,
    fareCurrency: row.fare_currency,
    polyline: row.polyline,
    label: "DEFAULT_ROUTE",
    key: routeFingerprint({ polyline: row.polyline, durationS: row.duration_s, distanceM: row.distance_m }),
    segments: null,
  }];
  let routes = fallback;
  try {
    const parsed = row.routes_json ? JSON.parse(row.routes_json) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Entries cached before route keys or segments existed still deserve a
      // stable identity and a uniform shape, so both are normalized on read
      // rather than discarding the entry. A row without segments reports null,
      // and the client draws the whole-journey line for it.
      routes = parsed.map((route) => ({
        ...route,
        key: route.key ?? routeFingerprint(route),
        segments: route.segments ?? null,
        transit: route.transit ?? null,
      }));
    }
  } catch {
    // A malformed legacy cache entry should not prevent the basic route from
    // being served. The next cache refresh replaces it.
  }
  return { routes, fetchedAt: row.fetched_at };
}
