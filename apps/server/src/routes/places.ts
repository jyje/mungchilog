import { Hono } from "hono";
import { db } from "../db.js";
import { requireAuth, requireApproved, type AuthEnv } from "../auth.js";

export const places = new Hono<AuthEnv>();
places.use("*", requireAuth, requireApproved);

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, same policy as legs

type PlaceRow = {
  place_id: string;
  opening_hours: string | null;
  details_json: string | null;
  details_fetched_at: string | null;
  fetched_at: string;
};

export const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "primaryTypeDisplayName",
  "rating",
  "userRatingCount",
  "regularOpeningHours",
  "websiteUri",
  "nationalPhoneNumber",
  "googleMapsUri",
].join(",");

export type PlaceDetails = {
  id: string;
  displayName: string | null;
  formattedAddress: string | null;
  location: { latitude: number; longitude: number } | null;
  category: string | null;
  rating: number | null;
  userRatingCount: number | null;
  regularOpeningHours: unknown | null;
  websiteUri: string | null;
  nationalPhoneNumber: string | null;
  googleMapsUri: string | null;
};

export function normalizePlaceDetails(placeId: string, data: Record<string, unknown>): PlaceDetails {
  const displayName = data.displayName as { text?: unknown } | undefined;
  const primaryType = data.primaryTypeDisplayName as { text?: unknown } | undefined;
  const location = data.location as { latitude?: unknown; longitude?: unknown } | undefined;
  const latitude = typeof location?.latitude === "number" && Number.isFinite(location.latitude) ? location.latitude : null;
  const longitude = typeof location?.longitude === "number" && Number.isFinite(location.longitude) ? location.longitude : null;
  return {
    id: typeof data.id === "string" ? data.id : placeId,
    displayName: typeof displayName?.text === "string" ? displayName.text : null,
    formattedAddress: typeof data.formattedAddress === "string" ? data.formattedAddress : null,
    location: latitude != null && longitude != null ? { latitude, longitude } : null,
    category: typeof primaryType?.text === "string" ? primaryType.text : null,
    rating: typeof data.rating === "number" && Number.isFinite(data.rating) ? data.rating : null,
    userRatingCount: typeof data.userRatingCount === "number" && Number.isInteger(data.userRatingCount) ? data.userRatingCount : null,
    regularOpeningHours: data.regularOpeningHours ?? null,
    websiteUri: typeof data.websiteUri === "string" ? data.websiteUri : null,
    nationalPhoneNumber: typeof data.nationalPhoneNumber === "string" ? data.nationalPhoneNumber : null,
    googleMapsUri: typeof data.googleMapsUri === "string" ? data.googleMapsUri : null,
  };
}

export function parseCachedPlaceDetails(value: string | null | undefined): PlaceDetails | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const details = parsed as Partial<PlaceDetails>;
    return typeof details.id === "string" ? details as PlaceDetails : null;
  } catch {
    return null;
  }
}

places.get("/:placeId/details", async (c) => {
  const placeId = c.req.param("placeId");
  if (!placeId || placeId.length > 512) return c.json({ error: "invalid place ID" }, 400);

  const cached = await db.get<PlaceRow>("SELECT * FROM places WHERE place_id = ?", [placeId]);
  const cachedDetails = parseCachedPlaceDetails(cached?.details_json);
  const detailsFetchedAt = cached?.details_fetched_at ?? null;
  if (cachedDetails && detailsFetchedAt && Date.now() - Date.parse(detailsFetchedAt) < TTL_MS) {
    return c.json({ details: cachedDetails, fetchedAt: detailsFetchedAt }, 200, { "X-Cache": "hit" });
  }

  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!apiKey) {
    return c.json({
      error: "GOOGLE_MAPS_SERVER_API_KEY not configured",
      cached: cachedDetails ? { details: cachedDetails, fetchedAt: detailsFetchedAt } : null,
    }, 501);
  }

  let details: PlaceDetails;
  try {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=ko`;
    const res = await fetch(url, { headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK } });
    if (!res.ok) throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    details = normalizePlaceDetails(placeId, await res.json() as Record<string, unknown>);
  } catch (error) {
    if (cachedDetails) return c.json({ details: cachedDetails, fetchedAt: detailsFetchedAt }, 200, { "X-Cache": "stale" });
    return c.json({ error: String((error as Error).message ?? error) }, 502);
  }

  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO places (place_id, opening_hours, details_json, details_fetched_at, fetched_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(place_id) DO UPDATE SET opening_hours = excluded.opening_hours, details_json = excluded.details_json, details_fetched_at = excluded.details_fetched_at, fetched_at = excluded.fetched_at`,
    [placeId, JSON.stringify(details.regularOpeningHours), JSON.stringify(details), now, now],
  );
  return c.json({ details, fetchedAt: now }, 200, { "X-Cache": "miss" });
});

// NOTE: written against the documented Places API (New) "Get Place"
// contract but not yet exercised against a live key (see TASK.md - the
// key is a user-provided blocker). Verify the response shape once one
// exists.
places.get("/:placeId/hours", async (c) => {
  const placeId = c.req.param("placeId");

  const cached = await db.get<PlaceRow>("SELECT * FROM places WHERE place_id = ?", [placeId]);
  if (cached && Date.now() - Date.parse(cached.fetched_at) < TTL_MS) {
    return c.json(toResponse(cached), 200, { "X-Cache": "hit" });
  }

  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!apiKey) {
    return c.json(
      { error: "GOOGLE_MAPS_SERVER_API_KEY not configured", cached: cached ? toResponse(cached) : null },
      501,
    );
  }

  let openingHours: unknown;
  try {
    // No regionCode - this is always called by placeId, already
    // unambiguous, so region biasing has nothing to do. languageCode is
    // the user's language preference, not tied to the destination.
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=ko`;
    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "regularOpeningHours",
      },
    });
    if (!res.ok) throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { regularOpeningHours?: unknown };
    openingHours = data.regularOpeningHours ?? null;
  } catch (e) {
    if (cached) return c.json(toResponse(cached), 200, { "X-Cache": "stale" });
    return c.json({ error: String((e as Error).message ?? e) }, 502);
  }

  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO places (place_id, opening_hours, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(place_id) DO UPDATE SET opening_hours = excluded.opening_hours, fetched_at = excluded.fetched_at`,
    [placeId, JSON.stringify(openingHours), now],
  );

  return c.json({ regularOpeningHours: openingHours, fetchedAt: now }, 200, { "X-Cache": "miss" });
});

function toResponse(row: PlaceRow) {
  return { regularOpeningHours: row.opening_hours ? JSON.parse(row.opening_hours) : null, fetchedAt: row.fetched_at };
}
