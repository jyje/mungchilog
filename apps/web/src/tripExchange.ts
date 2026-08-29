import { z } from "zod";
import { TripDataSchema, type TripData } from "./types";

export const TRIP_EXCHANGE_FORMAT = "mungchilog.trip";
export const TRIP_EXCHANGE_VERSION = 1;

// Portable files intentionally contain editable itinerary data only. The
// server id, membership, invitations, and the current user's role never
// cross this boundary.
export const TripExchangeSchema = z
  .object({
    format: z.literal(TRIP_EXCHANGE_FORMAT),
    version: z.literal(TRIP_EXCHANGE_VERSION),
    exportedAt: z.string().datetime({ offset: true }),
    trip: TripDataSchema,
  })
  .strict();

export type TripExchange = z.infer<typeof TripExchangeSchema>;

export function createTripExchange(trip: TripData, exportedAt = new Date().toISOString()): TripExchange {
  // Parsing produces a plain, schema-shaped object and deliberately drops
  // any server-only fields a caller might have included.
  return {
    format: TRIP_EXCHANGE_FORMAT,
    version: TRIP_EXCHANGE_VERSION,
    exportedAt,
    trip: TripDataSchema.parse(trip),
  };
}

export function parseTripExchange(value: unknown): TripData {
  const exchange = TripExchangeSchema.safeParse(value);
  if (exchange.success) return exchange.data.trip;

  // Keep a compatible migration path for the app's original paste-only
  // itinerary shape, but always return TripData, never its id. This makes
  // every offline import a new copy instead of an accidental overwrite.
  const legacy = TripDataSchema.safeParse(value);
  if (legacy.success) return legacy.data;

  throw new Error(exchange.error.issues.map((issue) => `${issue.path.join(".") || "파일"}: ${issue.message}`).join("\n"));
}

function exchangeFilename(title: string): string {
  const stem = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "trip";
  return `${stem}.mungchilog.json`;
}

export function downloadTripExchange(trip: TripData) {
  const contents = `${JSON.stringify(createTripExchange(trip), null, 2)}\n`;
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = exchangeFilename(trip.title);
  link.click();
  URL.revokeObjectURL(url);
}
