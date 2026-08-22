import { z } from "zod";

export const MAX_COVER_IMAGE_BYTES = 2 * 1024 * 1024;

const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/;

function decodedBase64ByteLength(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

export const TripCoverSchema = z
  .object({
    spotId: z.string().min(1).optional(),
    imageDataUrl: z.string().superRefine((value, ctx) => {
      const match = IMAGE_DATA_URL.exec(value);
      if (!match || !match[2]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "대표 이미지는 JPEG, PNG 또는 WebP 파일이어야 합니다." });
        return;
      }
      if (decodedBase64ByteLength(match[2]) > MAX_COVER_IMAGE_BYTES) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "대표 이미지는 2 MiB 이하여야 합니다." });
      }
    }).optional(),
  })
  .refine((cover) => cover.spotId || cover.imageDataUrl, { message: "대표 장소 또는 대표 이미지를 선택해주세요." });

// Mirrors apps/server/src/schema.ts. Duplicated for now since the project
// intentionally skipped a pnpm workspace (see PLAN.md): if this drifts,
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
  note: z.string().optional(),
  spots: z.array(SpotSchema).default([]),
});

export const TripDataSchema = z
  .object({
    title: z.string().min(1),
    // Any IANA timezone name - not locked to one destination.
    timezone: z.string().default("Asia/Tokyo"),
    currency: z.string().default("JPY"),
    startDate: z.string(),
    endDate: z.string(),
    days: z.array(DaySchema).default([]),
    cover: TripCoverSchema.nullable().optional(),
  })
  .superRefine((trip, ctx) => {
    if (!trip.cover?.spotId) return;
    const exists = trip.days.some((day) => day.spots.some((spot) => spot.id === trip.cover?.spotId));
    if (!exists) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cover", "spotId"], message: "대표 장소는 이 여행의 스팟이어야 합니다." });
    }
  });

export const TripImportSchema = z.object({ id: z.string().optional() }).and(TripDataSchema);

export type Item = z.infer<typeof ItemSchema>;
export type Spot = z.infer<typeof SpotSchema>;
export type Day = z.infer<typeof DaySchema>;
export type TripData = z.infer<typeof TripDataSchema>;
export type Trip = TripData & { id: string };
export type TripSummary = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  cover: {
    imageDataUrl?: string;
    spot?: Pick<Spot, "id" | "name" | "nameLocal" | "lat" | "lng">;
  } | null;
};
