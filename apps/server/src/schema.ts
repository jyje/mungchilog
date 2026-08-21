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
  // Original Japanese name. Shown on-screen to staff/station clerks on the ground.
  nameLocal: z.string().optional(),
  placeId: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  category: z.string().optional(),
  plannedArrival: z.string().optional(), // "HH:mm"
  dwellMinutes: z.number().int().nonnegative().optional(),
  // Transfer/walking buffer (minutes). Recommend 15 for major hub
  // stations (Shinjuku, Tokyo, Osaka, Umeda).
  bufferMinutes: z.number().int().nonnegative().default(10),
  note: z.string().optional(),
  items: z.array(ItemSchema).default([]),
});

export const DaySchema = z.object({
  date: z.string(), // "YYYY-MM-DD"
  spots: z.array(SpotSchema).default([]),
});

export const TripDataSchema = z.object({
  title: z.string().min(1),
  timezone: z.literal("Asia/Tokyo").default("Asia/Tokyo"),
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
