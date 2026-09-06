#!/usr/bin/env node
// One-off data migration for the v0.2.0 spot-timing change: dwellMinutes (a
// duration relative to plannedArrival) is replaced by an independent
// plannedDeparture wall-clock field. See
// docs/migrations/2026-spot-planned-departure.md for the full plan.
//
// The application does NOT depend on this having run - src/schedule.ts on
// the web client falls back to dwellMinutes indefinitely when
// plannedDeparture is absent. This script exists to actually clean up
// stored data instead of leaving two overlapping representations around
// forever, ahead of removing dwellMinutes from the schema entirely in
// v0.3.0.
//
// Idempotent: a trip with nothing left to upgrade is left completely
// untouched (byte-identical `data`, `updated_at` never touched), so running
// this repeatedly - or as a Kubernetes Job that might retry - is always
// safe.
//
// Runs against the ALREADY-BUILT dist/ output (not src/ TypeScript), same
// as the server's own `node dist/index.js` - this is what ships in the
// runtime image alongside dist/, with no dev toolchain available there to
// compile anything at run time (see apps/server/Dockerfile).
//
// Usage (from apps/server, after `npm run build`):
//   node scripts/migrate-spot-time-fields.mjs --dry-run   # report only
//   node scripts/migrate-spot-time-fields.mjs             # apply
// or via the npm script:
//   npm run migrate:spot-time-fields -- --dry-run
//
// Connects using this process's own DB_PROVIDER / DB_SQLITE_PATH /
// DB_POSTGRES_* environment - the same ones the server itself reads (see
// src/db.ts) - so it can run as a CLI locally or as a Kubernetes Job
// sharing the app's Secret/ConfigMap and PVC. See charts/mungchilog's
// migration-job.yaml template for the Job form.

import { pathToFileURL } from "node:url";
import { db } from "../dist/db.js";
import { TripDataSchema } from "../dist/schema.js";
import { upgradeTripData } from "../dist/spot-time-migration.js";

export async function migrateSpotTimeFields({ dryRun = false } = {}) {
  const rows = await db.all("SELECT id, data FROM trips");

  let upgraded = 0;
  let unchanged = 0;
  let failed = 0;

  for (const row of rows) {
    let parsed;
    try {
      parsed = TripDataSchema.parse(JSON.parse(row.data));
    } catch (error) {
      failed += 1;
      console.error(`[skip] trip ${row.id}: could not parse as valid trip data - ${error.message}`);
      continue;
    }

    const next = upgradeTripData(parsed);
    if (next === parsed) {
      unchanged += 1;
      continue;
    }

    const spotCount = next.days.reduce((total, day) => total + day.spots.length, 0);
    const changedSpots = next.days.reduce(
      (total, day, dayIndex) =>
        total + day.spots.filter((spot, spotIndex) => spot !== parsed.days[dayIndex].spots[spotIndex]).length,
      0,
    );
    console.log(`[${dryRun ? "dry-run" : "apply"}] trip ${row.id}: ${changedSpots}/${spotCount} spot(s) upgraded`);

    if (!dryRun) {
      // updated_at is deliberately left alone - this is a storage-format
      // cleanup, not a user edit, and must not reorder "recently updated"
      // trip lists or notify anyone.
      await db.run("UPDATE trips SET data = ? WHERE id = ?", [JSON.stringify(next), row.id]);
    }
    upgraded += 1;
  }

  console.log(
    `\n${dryRun ? "Would upgrade" : "Upgraded"} ${upgraded} trip(s), ${unchanged} already current, ${failed} unparsable (left untouched) - ${rows.length} total.`,
  );
  return { total: rows.length, upgraded, unchanged, failed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes("--dry-run");
  const result = await migrateSpotTimeFields({ dryRun });
  await db.close();
  if (result.failed > 0) process.exitCode = 1;
}
