import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";

export const legs = new Hono();

const TRAVEL_MODES = ["DRIVE", "WALK", "BICYCLE", "TRANSIT", "TWO_WHEELER"] as const;

const ComputeLegSchema = z.object({
  fromPlaceId: z.string(),
  toPlaceId: z.string(),
  mode: z.enum(TRAVEL_MODES),
  // ISO 8601. Defaults to "now": only matters for picking the cache
  // bucket and (for TRANSIT) which timetable Google quotes.
  when: z.string().datetime().optional(),
});

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, per PLAN.md's caching policy

type LegRow = {
  id: string;
  distance_m: number | null;
  duration_s: number | null;
  fare_amount: number | null;
  fare_currency: string | null;
  polyline: string | null;
  fetched_at: string;
};

// (day-of-week, 4-hour-of-day block) in Asia/Tokyo: coarse enough that a
// handful of trip days share cache entries, fine enough that morning vs.
// evening transit schedules don't collide.
function bucketFor(when: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(when);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Unk";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  return `${weekday}-${Math.floor(hour / 4)}`;
}

function cacheKey(fromPlaceId: string, toPlaceId: string, mode: string, bucket: string): string {
  return `${fromPlaceId}:${toPlaceId}:${mode}:${bucket}`;
}

legs.post("/compute", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (body === null) return c.json({ error: "invalid JSON body" }, 400);

  const parsed = ComputeLegSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);

  const { fromPlaceId, toPlaceId, mode } = parsed.data;
  const when = parsed.data.when ? new Date(parsed.data.when) : new Date();
  const bucket = bucketFor(when);
  const id = cacheKey(fromPlaceId, toPlaceId, mode, bucket);

  const cached = db.prepare("SELECT * FROM legs WHERE id = ?").get(id) as LegRow | undefined;
  if (cached && Date.now() - Date.parse(cached.fetched_at) < TTL_MS) {
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
    fetched = await callRoutesApi(apiKey, fromPlaceId, toPlaceId, mode, when);
  } catch (e) {
    // Serve a stale cache entry rather than nothing, if one exists.
    if (cached) return c.json(toLegResponse(cached), 200, { "X-Cache": "stale" });
    return c.json({ error: String((e as Error).message ?? e) }, 502);
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO legs (id, from_place_id, to_place_id, mode, bucket, distance_m, duration_s, fare_amount, fare_currency, polyline, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       distance_m = excluded.distance_m,
       duration_s = excluded.duration_s,
       fare_amount = excluded.fare_amount,
       fare_currency = excluded.fare_currency,
       polyline = excluded.polyline,
       fetched_at = excluded.fetched_at`,
  ).run(
    id,
    fromPlaceId,
    toPlaceId,
    mode,
    bucket,
    fetched.distanceM,
    fetched.durationS,
    fetched.fareAmount,
    fetched.fareCurrency,
    fetched.polyline,
    now,
  );

  return c.json(
    { fromPlaceId, toPlaceId, mode, ...fetched, fetchedAt: now },
    200,
    { "X-Cache": "miss" },
  );
});

function toLegResponse(row: LegRow) {
  return {
    distanceM: row.distance_m,
    durationS: row.duration_s,
    fareAmount: row.fare_amount,
    fareCurrency: row.fare_currency,
    polyline: row.polyline,
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
) {
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.travelAdvisory.transitFare",
    },
    body: JSON.stringify({
      origin: { placeId: fromPlaceId },
      destination: { placeId: toPlaceId },
      travelMode: mode,
      ...(mode === "TRANSIT" ? { departureTime: when.toISOString() } : {}),
      languageCode: "ko",
      regionCode: "JP",
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
    }>;
  };

  const route = data.routes?.[0];
  if (!route) throw new Error("Routes API returned no routes");

  const fare = route.travelAdvisory?.transitFare;
  return {
    distanceM: route.distanceMeters ?? null,
    durationS: route.duration ? Number(route.duration.replace(/s$/, "")) : null,
    fareAmount: fare?.units != null ? Number(fare.units) : null,
    fareCurrency: fare?.currencyCode ?? null,
    polyline: route.polyline?.encodedPolyline ?? null,
  };
}
