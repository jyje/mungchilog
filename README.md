<div align="center">

# jyje/mungchilog

<img width="120" src="https://raw.githubusercontent.com/jyje/mungchilog/main/apps/web/public/pwa-512.png" alt="mungchilog" title="mungchilog"/>

**뭉치 + log** — a personal travel itinerary app with live Google Maps routing

[![Build](https://github.com/jyje/mungchilog/actions/workflows/build.yml/badge.svg)](https://github.com/jyje/mungchilog/actions/workflows/build.yml)

</div>

## Overview

mungchilog plans a trip's day-by-day route and shows it live on Google Maps while traveling: distance, transit time, and what to buy or eat at each stop. Built for a specific trip to Japan, kept small enough to actually finish before departure.

Live at `https://mungchilog.app.jyje.online` (personal itinerary data, gated behind Basic Auth).

## Features

- **Two ways in**: paste a trip as JSON, or build it through the web UI (add days, spots, checklist items)
- **Drag-to-reorder** spots within a day
- **Buy / eat / to-do checklist** per spot, with local-language place names for showing staff on the ground
- **Live routing**: distance, transit time, and fare between spots (Google Routes API), with opening-hours lookup (Places API) — both degrade to a plain placeholder until a key is configured, no broken UI in the meantime
- **PWA**: installable, offline-capable (IndexedDB-persisted cache) for dead zones underground

## Stack

- **Server**: [Hono](https://hono.dev) on Node.js, SQLite (`node:sqlite`)
- **Web**: React 19 + Vite, [TanStack Query](https://tanstack.com/query), [dnd-kit](https://dndkit.com), [@vis.gl/react-google-maps](https://visgl.github.io/react-google-maps/)
- **Deploy**: single container, GitOps via ArgoCD on a self-hosted microk8s cluster (manifests in [jyje/cluster](https://github.com/jyje/cluster))

## Development

```bash
cd apps/server && npm install && npm run dev   # http://localhost:3000
cd apps/web && npm install && npm run dev       # http://localhost:5173
```

Copy `.env.sample` to `.env` at the repo root for local Google Maps keys (optional — the app runs fine without them, map and routing UI just show a placeholder).

See [`PLAN.md`](PLAN.md) for architecture decisions and [`TASK.md`](TASK.md) for the milestone checklist.
