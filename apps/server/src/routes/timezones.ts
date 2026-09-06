import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../auth.js";
import { describeGoogleTimezoneFailure, timestampForTripDate, timezoneFromGoogleResponse } from "../timezone-lookup.js";

export const timezones = new Hono<AuthEnv>();

const QuerySchema = z.object({
  lat: z.coerce.number().finite().gte(-90).lte(90),
  lng: z.coerce.number().finite().gte(-180).lte(180),
  date: z.string().optional(),
});

// Google Time Zone API is queried only from the server so the browser key is
// not broadened. A missing/disabled API is non-fatal: the creation form keeps
// its documented Asia/Seoul fallback and remains usable offline. A failure
// is still logged (status/reason only, never the API key or full URL) so a
// misconfigured key (e.g. Time Zone API not enabled for it) shows up in
// server logs instead of silently always falling back for every trip.
timezones.get("/", async (c) => {
  const query = QuerySchema.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "valid latitude and longitude are required" }, 400);

  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!apiKey) {
    console.error("[timezones] GOOGLE_MAPS_SERVER_API_KEY is not set - falling back to the default timezone for every trip");
    return c.json({ timezone: null });
  }

  const { lat, lng, date } = query.data;
  const url = new URL("https://maps.googleapis.com/maps/api/timezone/json");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("timestamp", String(timestampForTripDate(date)));
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url);
    const body = await response.json().catch(() => null);
    const timezone = timezoneFromGoogleResponse(body);
    if (!timezone) {
      const reason = describeGoogleTimezoneFailure(body) ?? `unexpected response (HTTP ${response.status})`;
      console.error(`[timezones] Google Time Zone API lookup failed for ${lat},${lng}: ${reason}`);
    }
    return c.json({ timezone });
  } catch (error) {
    console.error(`[timezones] Google Time Zone API request failed for ${lat},${lng}: ${(error as Error).message}`);
    return c.json({ timezone: null });
  }
});
