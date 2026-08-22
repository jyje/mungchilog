import { z } from "zod";

// Trip itinerary JSON schema. Stored as-is in the Trip.data column.
// This schema is the source of truth: once apps/web exists in M2, the
// client reuses the same shape (server-only for now).

export const ItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["buy", "eat", "todo"]),
  title: z.string().min(1),
  price: z.number().nonnegative().optional(),
  done: z.boolean().default(false),
  photoUrl: z.string().url().optional(),
});

export const SpotSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  name: z.string().min(1),
  // Name in the local script/language of the destination. Shown
  // on-screen to staff, drivers, station clerks on the ground.
  nameLocal: z.string().optional(),
  placeId: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  category: z.string().optional(),
  plannedArrival: z.string().optional(), // "HH:mm"
  dwellMinutes: z.number().int().nonnegative().optional(),
  // Transfer/walking buffer (minutes). Bump this for major transit
  // hubs, wherever the trip is - Google routinely underestimates
  // in-station walking time at big stations/airports.
  bufferMinutes: z.number().int().nonnegative().default(10),
  // Freeform markdown notes scoped to this one spot (opening-hours quirks,
  // "ask for the window seat", a phrase to show staff) - rendered/edited
  // as markdown client-side, stored as plain text server-side either way.
  note: z.string().optional(),
  items: z.array(ItemSchema).default([]),
});

export const DaySchema = z.object({
  date: z.string(), // "YYYY-MM-DD"
  // Freeform markdown notes for the day as a whole (weather plan, packing
  // reminders, "call the ryokan by noon") - separate from each spot's own
  // `note`, which is scoped to that one stop.
  note: z.string().optional(),
  spots: z.array(SpotSchema).default([]),
});

export const TripDataSchema = z.object({
  title: z.string().min(1),
  // Any IANA timezone name (e.g. "Asia/Tokyo", "Europe/Paris",
  // "America/New_York"). Not locked to one destination - see
  // routes/legs.ts for how this drives route-time calculations.
  timezone: z.string().default("Asia/Tokyo"),
  currency: z.string().default("JPY"),
  startDate: z.string(),
  endDate: z.string(),
  days: z.array(DaySchema).default([]),
});

// Import request body: providing id upserts, omitting it creates new.
export const TripImportSchema = TripDataSchema.extend({
  id: z.string().optional(),
});

export type TripData = z.infer<typeof TripDataSchema>;
export type TripImport = z.infer<typeof TripImportSchema>;
