import { z } from "zod";

// Mirrors apps/server/src/schema.ts. Duplicated for now since the project
// intentionally skipped a pnpm workspace (see PLAN.md) — if this drifts,
// reconcile against the server copy, which is the source of truth.

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
  nameLocal: z.string().optional(),
  placeId: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  category: z.string().optional(),
  plannedArrival: z.string().optional(),
  dwellMinutes: z.number().int().nonnegative().optional(),
  bufferMinutes: z.number().int().nonnegative().default(10),
  note: z.string().optional(),
  items: z.array(ItemSchema).default([]),
});

export const DaySchema = z.object({
  date: z.string(),
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

export const TripImportSchema = TripDataSchema.extend({
  id: z.string().optional(),
});

export type Item = z.infer<typeof ItemSchema>;
export type Spot = z.infer<typeof SpotSchema>;
export type Day = z.infer<typeof DaySchema>;
export type TripData = z.infer<typeof TripDataSchema>;
export type Trip = TripData & { id: string };
export type TripSummary = { id: string; title: string; startDate: string; endDate: string };
