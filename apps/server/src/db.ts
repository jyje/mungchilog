import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Default is a local dev path. In the cluster, the PVC is mounted at
// /app/data and must match the Helm chart's values.yaml persistence.mountPath.
const DB_PATH = process.env.DB_PATH ?? "./data/mungchilog.db";

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// The cluster's only StorageClass is NFS-backed (no block storage
// available — see helm/mungchilog's values.yaml in jyje/cluster). WAL
// mode depends on shared-memory mmap and real POSIX locks, which NFS
// does not reliably provide, so force the classic rollback-journal mode
// instead. This app also runs a single replica with a ReadWriteOnce PVC,
// so there is only ever one writer — the well-known SQLite-over-NFS
// corruption risk is a multi-writer problem this app doesn't have.
db.exec("PRAGMA journal_mode = DELETE;");
db.exec("PRAGMA busy_timeout = 5000;");

db.exec(`
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Routes API cache, populated in M3. The 30-day TTL is enforced at the
  -- application level based on fetched_at (no SQLite-side TTL trigger).
  -- id is a deterministic cache key: fromPlaceId:toPlaceId:mode:bucket,
  -- where bucket is (day-of-week, hour-of-day/4) in Asia/Tokyo — see
  -- routes/legs.ts. Same key in, same row updated, no duplicates.
  CREATE TABLE IF NOT EXISTS legs (
    id TEXT PRIMARY KEY,
    from_place_id TEXT NOT NULL,
    to_place_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    bucket TEXT NOT NULL,
    distance_m INTEGER,
    duration_s INTEGER,
    fare_amount INTEGER,
    fare_currency TEXT,
    polyline TEXT,
    fetched_at TEXT NOT NULL
  );
`);
