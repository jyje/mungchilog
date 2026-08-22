import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Default is a local dev path. In the cluster, the PVC is mounted at
// /app/data and must match the Helm chart's values.yaml persistence.mountPath.
const DB_PATH = process.env.DB_PATH ?? "./data/mungchilog.db";

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// The cluster's only StorageClass is NFS-backed (no block storage
// available: see helm/mungchilog's values.yaml in jyje/cluster). WAL
// mode depends on shared-memory mmap and real POSIX locks, which NFS
// does not reliably provide, so force the classic rollback-journal mode
// instead. This app also runs a single replica with a ReadWriteOnce PVC,
// so there is only ever one writer: the well-known SQLite-over-NFS
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
  -- where bucket is (day-of-week, hour-of-day/4) in Asia/Tokyo: see
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

  -- Places details cache (opening hours, for M4's "is it open today").
  -- Same 30-day TTL policy as legs, enforced at the application level.
  CREATE TABLE IF NOT EXISTS places (
    place_id TEXT PRIMARY KEY,
    opening_hours TEXT,
    fetched_at TEXT NOT NULL
  );

  -- M6: OIDC-authenticated users. Created on first successful login, not
  -- provisioned in advance - status starts "pending" so a stranger who
  -- somehow gets past the Ingress's Basic Auth still can't see anyone's
  -- trip data until the admin approves them. The ADMIN_EMAIL env var's
  -- owner is auto-approved as "admin" the moment they first log in
  -- (see auth.ts).
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved'
    role TEXT NOT NULL DEFAULT 'member',    -- 'admin' | 'member'
    created_at TEXT NOT NULL
  );

  -- Server-side sessions (not a self-contained JWT cookie) so logout and
  -- admin-initiated revocation both actually take effect immediately,
  -- without needing a token blocklist.
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  -- Per-trip sharing. "owner" is whoever created the trip (or the admin,
  -- for trips that existed before M6 - see auth.ts's backfill); "editor"
  -- is anyone the owner/admin has invited. Both roles can fully edit the
  -- itinerary (jyje's call: real shared editing, not read-only viewing) -
  -- only "owner" can additionally delete the trip or manage who else is on
  -- it. Concurrent edits are last-write-wins on the whole trip JSON, same
  -- as this app has always done for one person across multiple tabs/
  -- devices - there's no operational-transform/CRDT merge here.
  CREATE TABLE IF NOT EXISTS trip_members (
    trip_id TEXT NOT NULL REFERENCES trips(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'editor', -- 'owner' | 'editor'
    created_at TEXT NOT NULL,
    PRIMARY KEY (trip_id, user_id)
  );
`);
