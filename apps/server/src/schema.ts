import { z } from "zod";

export const MAX_COVER_IMAGE_BYTES = 2 * 1024 * 1024;

const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/;

function decodedBase64ByteLength(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function hasDeclaredImageSignature(mimeType: string, encoded: string): boolean {
  const bytes = Buffer.from(encoded, "base64");
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

export const TripCoverSchema = z
  .object({
    // A selected itinerary spot is optional so a user can use a photo-only
    // cover. When both exist, the list prefers the photo and retains the
    // place as the map fallback.
    spotId: z.string().min(1).optional(),
    imageDataUrl: z.string().superRefine((value, ctx) => {
      const match = IMAGE_DATA_URL.exec(value);
      if (!match || !match[2]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cover image must be a JPEG, PNG, or WebP file" });
        return;
      }
      if (decodedBase64ByteLength(match[2]) > MAX_COVER_IMAGE_BYTES) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cover image must not exceed 2 MiB" });
        return;
      }
      if (!hasDeclaredImageSignature(match[1], match[2])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cover image content must match its declared image format" });
      }
    }).optional(),
  })
  .refine((cover) => cover.spotId || cover.imageDataUrl, { message: "a cover needs a representative place or image" });

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

export const TripDataSchema = z
  .object({
    title: z.string().min(1),
    // Any IANA timezone name (e.g. "Asia/Tokyo", "Europe/Paris",
    // "America/New_York"). Not locked to one destination - see
    // routes/legs.ts for how this drives route-time calculations.
    timezone: z.string().default("Asia/Tokyo"),
    currency: z.string().default("JPY"),
    startDate: z.string(),
    endDate: z.string(),
    days: z.array(DaySchema).default([]),
    // null is an intentional clear. Omitting the field during an import
    // preserves an existing cover instead of unexpectedly removing it.
    cover: TripCoverSchema.nullable().optional(),
  })
  .superRefine((trip, ctx) => {
    if (!trip.cover?.spotId) return;
    const exists = trip.days.some((day) => day.spots.some((spot) => spot.id === trip.cover?.spotId));
    if (!exists) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cover", "spotId"], message: "cover spot must belong to this trip" });
    }
  });

// Import request body: providing id upserts, omitting it creates new. The
// trip schema has cross-field validation, so compose instead of calling
// .extend() on its ZodEffects wrapper.
export const TripImportSchema = z.object({ id: z.string().optional() }).and(TripDataSchema);

export type TripData = z.infer<typeof TripDataSchema>;
export type TripImport = z.infer<typeof TripImportSchema>;
