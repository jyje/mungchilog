import type { Database } from "./db.js";

export const USAGE_WINDOWS = ["24h", "7d", "30d"] as const;
export type UsageWindow = (typeof USAGE_WINDOWS)[number];

export type ApplicationUsage = {
  users: { pending: number; approved: number };
  trips: number;
  memberships: number;
  routeCache: { entries: number; freshEntries: number };
  placeCache: { entries: number; freshEntries: number };
};

export type GoogleUsageUnavailable =
  | { status: "disabled"; reason: "not-configured" }
  | { status: "unavailable"; reason: "provider-error" };

export type GoogleUsageService = {
  service: string;
  label: string;
  requests: number;
  errors: number;
  errorRate: number;
  latencyMs: { p50: number | null; p95: number | null };
  quota: { usage: number; limit: number; ratio: number } | null;
  trend: Array<{ at: string; requests: number; errors: number }>;
};

export type GoogleUsageAvailable = {
  status: "available";
  sampledUntil: string;
  services: GoogleUsageService[];
};

export type GoogleUsage = GoogleUsageUnavailable | GoogleUsageAvailable;

export type AdminUsageResponse = {
  window: UsageWindow;
  generatedAt: string;
  application: ApplicationUsage;
  google: GoogleUsage;
};

type AggregateRow = {
  users_pending: number | string;
  users_approved: number | string;
  trips: number | string;
  memberships: number | string;
  route_cache_entries: number | string;
  route_cache_fresh: number | string;
  place_cache_entries: number | string;
  place_cache_fresh: number | string;
};

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function count(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

// Scalar subqueries keep this aggregation portable across SQLite and
// PostgreSQL and return one bounded row regardless of database size.
export async function readApplicationUsage(
  database: Pick<Database, "get">,
  now = new Date(),
): Promise<ApplicationUsage> {
  const freshAfter = new Date(now.getTime() - CACHE_TTL_MS).toISOString();
  const row = await database.get<AggregateRow>(
    `SELECT
      (SELECT COUNT(*) FROM users WHERE status = 'pending') AS users_pending,
      (SELECT COUNT(*) FROM users WHERE status = 'approved') AS users_approved,
      (SELECT COUNT(*) FROM trips) AS trips,
      (SELECT COUNT(*) FROM trip_members) AS memberships,
      (SELECT COUNT(*) FROM legs) AS route_cache_entries,
      (SELECT COUNT(*) FROM legs WHERE fetched_at >= ?) AS route_cache_fresh,
      (SELECT COUNT(*) FROM places) AS place_cache_entries,
      (SELECT COUNT(*) FROM places WHERE fetched_at >= ?) AS place_cache_fresh`,
    [freshAfter, freshAfter],
  );

  if (!row) throw new Error("usage aggregate query returned no row");
  return {
    users: { pending: count(row.users_pending), approved: count(row.users_approved) },
    trips: count(row.trips),
    memberships: count(row.memberships),
    routeCache: { entries: count(row.route_cache_entries), freshEntries: count(row.route_cache_fresh) },
    placeCache: { entries: count(row.place_cache_entries), freshEntries: count(row.place_cache_fresh) },
  };
}
