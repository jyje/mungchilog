# syntax=docker/dockerfile:1.7
# Build context is the repo root (see .github/workflows/build.yml) so this
# stage can reach apps/web as well as apps/server.

FROM node:22-alpine AS web-build
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci
COPY apps/web/ ./
# Vite inlines VITE_* env vars at build time, not runtime: so the Maps
# key (once it exists) has to be a build-arg, not a container env var.
# Left empty, TripMap.tsx renders a placeholder instead of a live map.
ARG VITE_GOOGLE_MAPS_API_KEY=""
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
RUN npm run build

FROM node:22-alpine AS server-build
WORKDIR /app
COPY apps/server/package.json apps/server/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci
COPY apps/server/tsconfig.json ./
COPY apps/server/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY apps/server/package.json apps/server/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --omit=dev
COPY --from=server-build /app/dist ./dist
COPY --from=web-build /web/dist ./public
# node:sqlite is experimental on Node 22 (unflagged from Node 24+); pin this
# flag as long as the runtime stage stays on node:22-alpine.
ENV NODE_OPTIONS=--experimental-sqlite
EXPOSE 3000
CMD ["node", "dist/index.js"]
