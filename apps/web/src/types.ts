import { z } from "zod";

export const MAX_COVER_IMAGE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_TIMEZONE = "Asia/Seoul";

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

export const SpotTimeKindSchema = z.enum(["APPROXIMATE", "RESERVATION"]);
const WALL_CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const SpotSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  name: z.string().min(1),
  nameLocal: z.string().optional(),
  placeId: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  category: z.string().optional(),
  plannedArrival: z.string().regex(WALL_CLOCK_TIME, "시간은 24시간제 HH:mm 형식이어야 합니다.").optional(),
  timeKind: SpotTimeKindSchema.optional(),
  dwellMinutes: z.number().int().nonnegative().optional(),
  bufferMinutes: z.number().int().nonnegative().default(10),
  note: z.string().optional(),
  items: z.array(ItemSchema).default([]),
}).superRefine((spot, ctx) => {
  if ((spot.lat == null) !== (spot.lng == null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [spot.lat == null ? "lat" : "lng"], message: "위도와 경도는 함께 저장해야 합니다." });
  }
  if (spot.timeKind && !spot.plannedArrival) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["plannedArrival"], message: "시간 유형을 선택하면 시각도 입력해야 합니다." });
  }
});

// Mirrors the server schema. The preference belongs to a directed pair of
// spots so it cannot silently move to a different destination after reorder.
export const PersistedLegModeSchema = z.enum(["DIRECT", "TRANSIT", "DRIVE", "WALK"]);
export const LegPreferenceSchema = z.object({
  fromSpotId: z.string().min(1),
  toSpotId: z.string().min(1),
  mode: PersistedLegModeSchema,
  routeIndex: z.number().int().min(0).max(3).default(0),
  trafficAware: z.boolean().default(false),
});

export const DaySchema = z
  .object({
    date: z.string(),
    note: z.string().optional(),
    spots: z.array(SpotSchema).default([]),
    legPreferences: z.array(LegPreferenceSchema).default([]),
  })
  .superRefine((day, ctx) => {
    const spotIds = new Set(day.spots.map((spot) => spot.id));
    const pairs = new Set<string>();
    day.legPreferences.forEach((preference, index) => {
      const path = ["legPreferences", index];
      if (preference.fromSpotId === preference.toSpotId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "동선은 서로 다른 두 스팟을 연결해야 합니다." });
      }
      if (preference.trafficAware && preference.mode !== "DRIVE") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "실시간 교통 정보는 운전 동선에서만 사용할 수 있습니다." });
      }
      if (!spotIds.has(preference.fromSpotId) || !spotIds.has(preference.toSpotId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "동선의 스팟은 같은 날짜 일정에 있어야 합니다." });
      }
      const pair = `${preference.fromSpotId}:${preference.toSpotId}`;
      if (pairs.has(pair)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "같은 구간에는 동선을 하나만 저장할 수 있습니다." });
      }
      pairs.add(pair);
    });
  });

export const TripDataSchema = z
  .object({
    title: z.string().min(1),
    // Any IANA timezone name - not locked to one destination.
    // An omitted or blank value is deliberately Seoul time. This gives
    // pasted/offline itineraries a stable default without guessing from the
    // browser's local timezone.
    timezone: z.string().trim().default(DEFAULT_TIMEZONE).transform((value) => value || DEFAULT_TIMEZONE),
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
export type SpotTimeKind = z.infer<typeof SpotTimeKindSchema>;
export type PersistedLegMode = z.infer<typeof PersistedLegModeSchema>;
export type LegPreference = z.infer<typeof LegPreferenceSchema>;
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
