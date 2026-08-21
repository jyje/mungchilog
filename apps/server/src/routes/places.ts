import { Hono } from "hono";
import { db } from "../db.js";

export const places = new Hono();

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, same policy as legs

type PlaceRow = {
  place_id: string;
  opening_hours: string | null;
  fetched_at: string;
};

// NOTE: written against the documented Places API (New) "Get Place"
// contract but not yet exercised against a live key (see TASK.md - the
// key is a user-provided blocker). Verify the response shape once one
// exists.
places.get("/:placeId/hours", async (c) => {
  const placeId = c.req.param("placeId");

  const cached = db.prepare("SELECT * FROM places WHERE place_id = ?").get(placeId) as PlaceRow | undefined;
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
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=ko&regionCode=JP`;
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
  db.prepare(
    `INSERT INTO places (place_id, opening_hours, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(place_id) DO UPDATE SET opening_hours = excluded.opening_hours, fetched_at = excluded.fetched_at`,
  ).run(placeId, JSON.stringify(openingHours), now);

  return c.json({ regularOpeningHours: openingHours, fetchedAt: now }, 200, { "X-Cache": "miss" });
});

function toResponse(row: PlaceRow) {
  return { regularOpeningHours: row.opening_hours ? JSON.parse(row.opening_hours) : null, fetchedAt: row.fetched_at };
}
