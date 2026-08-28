<div align="center">

# jyje/mungchilog

<img width="120" src="https://raw.githubusercontent.com/jyje/mungchilog/dev/apps/web/public/pwa-512.png" alt="mungchilog" title="mungchilog"/>

**뭉치 + log**: a personal travel itinerary app with live Google Maps routing, for any destination

[![Build](https://github.com/jyje/mungchilog/actions/workflows/build.yml/badge.svg)](https://github.com/jyje/mungchilog/actions/workflows/build.yml)

</div>

## Overview

mungchilog plans a trip's day-by-day route and shows it live on Google Maps while traveling: distance, transit time, and what to buy or eat at each stop. Not locked to one destination or timezone; the first trip it was built for happens to be Japan, but any IANA timezone works.

Live at `https://mungchilog.app.jyje.online` through OIDC sign-in.

## Features

- **Two ways in**: paste a trip as JSON, or build it through the web UI (add days, spots, checklist items)
- **Drag-to-reorder** spots within a day
- **Buy / eat / to-do checklist** per spot, with local-language place names for showing staff on the ground
- **Live routing**: distance, transit time, and fare between spots (Google Routes API), with opening-hours lookup (Places API); both degrade to a plain placeholder until a key is configured, no broken UI in the meantime
- **PWA**: installable, offline-capable (IndexedDB-persisted cache) for dead zones underground

## Stack

- **Server**: [Hono](https://hono.dev) on Node.js, selectable SQLite (`node:sqlite`) or PostgreSQL storage
- **Web**: React 19 + Vite, [TanStack Query](https://tanstack.com/query), [dnd-kit](https://dndkit.com), [@vis.gl/react-google-maps](https://visgl.github.io/react-google-maps/)
- **Deploy**: single container, GitOps via ArgoCD on a self-hosted microk8s cluster (manifests in [jyje/cluster](https://github.com/jyje/cluster))

## Development

```bash
cd apps/server && npm install && npm run dev   # http://localhost:3000
cd apps/web && npm install && npm run dev       # http://localhost:5173
```

Copy `.env.sample` to `.env` at the repo root for local Google Maps keys (optional: the app runs fine without them, map and routing UI just show a placeholder).

### Container development

The production image contains both the compiled React application and the Hono
server. The server exposes the API and serves the web application's static
files, so the runtime is one `app` container on port 3000.

Run the default SQLite-backed container locally:

```bash
docker compose up --build
```

Open `http://localhost:3000`. The Compose configuration sets development mode
only for local use, which permits the documented local pseudo-user when OIDC is
not configured. It is not a production deployment configuration.

To verify the PostgreSQL provider, layer its Compose override over the default
configuration:

```bash
docker compose -f docker-compose.yaml -f docker/docker-compose.postgres.yaml up --build
```

The SQLite and PostgreSQL data directories use separate named Docker volumes.
Remove them only when intentionally resetting local data:

```bash
docker compose down --volumes
docker compose -f docker-compose.yaml -f docker/docker-compose.postgres.yaml down --volumes
```

### Database backend

SQLite is the default and keeps data in `./data/mungchilog.db`. To use another
path, set `DB_PROVIDER=sqlite` and
`DB_SQLITE_PATH=/path/to/mungchilog.db`.

For PostgreSQL, set `DB_PROVIDER=postgres` and either a complete
`DB_POSTGRES_URL`, for example
`postgresql://user:password@host:5432/mungchilog?sslmode=require`, or every
component setting: `DB_POSTGRES_HOST`, `DB_POSTGRES_PORT`,
`DB_POSTGRES_DATABASE`, `DB_POSTGRES_USERNAME`, and `DB_POSTGRES_PASSWORD`.
The server initializes the same schema for either provider. Keep credentials in
your local `.env` or deployment secret, never in the repository. Switching an
existing deployment to PostgreSQL initializes an empty schema; migrate existing
SQLite data separately before changing providers.

### Helm chart

The source chart is maintained in [`charts/mungchilog`](charts/mungchilog).
It renders the same provider-specific environment variables as the server:
`DB_SQLITE_PATH` for SQLite, or `DB_POSTGRES_URL` / the complete set of
`DB_POSTGRES_*` component values for PostgreSQL. PostgreSQL credentials must
come from an existing Kubernetes Secret and are never chart values.

Chart releases are OCI artifacts published to
`oci://ghcr.io/jyje/charts/mungchilog`. Every chart source change must bump
`charts/mungchilog/Chart.yaml` before merge. The `prd` branch release workflow
then packages and publishes that immutable version. Cluster GitOps
configuration should consume the version rather than copying chart source.

### Environment image packages

Each environment has a separate GHCR package so release candidates and
production releases remain easy to identify and retain independently:

- Development: `ghcr.io/jyje/mungchilog-dev:r<run>-<sha>`
- Staging: `ghcr.io/jyje/mungchilog-stg:r<run>-<sha>`
- Production: `ghcr.io/jyje/mungchilog:v<major>.<minor>.<patch>` and
  `ghcr.io/jyje/mungchilog:v<major>.<minor>.<patch>-r<run>-<sha>`

Promotion copies the verified multi-architecture OCI manifest from development
to staging and then production. It does not rebuild the image. GitOps must pin
an explicit production version or immutable digest and never use `latest`.

See [`PLAN.md`](PLAN.md) for architecture decisions and [`TASK.md`](TASK.md) for the milestone checklist.
