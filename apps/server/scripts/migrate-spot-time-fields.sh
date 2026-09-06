#!/usr/bin/env bash
# Local/manual runner for the v0.2.0 spot-timing migration
# (dwellMinutes -> plannedDeparture). See
# docs/migrations/2026-spot-planned-departure.md.
#
# In the cluster this same script + compiled dist/ is what ArgoCD's PreSync
# hook Job runs (see charts/mungchilog/templates/migration-job.yaml) - this
# wrapper exists so a person can run the identical migration by hand
# against a local or port-forwarded database without reconstructing the
# npm/node/env-file incantation from memory.
#
# Usage (from anywhere in the repo):
#   apps/server/scripts/migrate-spot-time-fields.sh --dry-run
#   apps/server/scripts/migrate-spot-time-fields.sh
#
# Reads DB_PROVIDER / DB_SQLITE_PATH / DB_POSTGRES_* from the environment or
# from .env at the repo root, same as `npm run dev`.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
npm run build --silent
exec env NODE_OPTIONS=--experimental-sqlite node --env-file-if-exists=../../.env scripts/migrate-spot-time-fields.mjs "$@"
