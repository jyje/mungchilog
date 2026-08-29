import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../auth.js";
import { timestampForTripDate, timezoneFromGoogleResponse } from "../timezone-lookup.js";

export const timezones = new Hono<AuthEnv>();

const QuerySchema = z.object({
  lat: z.coerce.number().finite().gte(-90).lte(90),
  lng: z.coerce.number().finite().gte(-180).lte(180),
  date: z.string().optional(),
});

// Google Time Zone API is queried only from the server so the browser key is
// not broadened. A missing/disabled API is non-fatal: the creation form keeps
// its documented Asia/Seoul fallback and remains usable offline.
timezones.get("/", async (c) => {
  const query = QuerySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "valid latitude and longitude are required" }, 400);

  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!apiKey) return c.json({ timezone: null });

  const { lat, lng, date } = query.data;
  const url = new URL("https://maps.googleapis.com/maps/api/timezone/json");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("timestamp", String(timestampForTripDate(date)));
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url);
    const timezone = timezoneFromGoogleResponse(await response.json().catch(() => null));
    return c.json({ timezone });
  } catch {
    return c.json({ timezone: null });
  }
});
