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
# The server build type-checks focused tests that import the final-layer
# generator, so its typed script contract must be present in this stage too.
COPY apps/server/scripts ./scripts
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY apps/server/package.json apps/server/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --omit=dev
COPY --from=server-build /app/dist ./dist
COPY --from=web-build /web/dist ./public
COPY apps/server/scripts ./scripts

# Keep build identity out of the compiled frontend. Promotion builds use the
# same application layers and replace only this tiny file in the final layer.
# These are ARGs deliberately: none become runtime environment variables.
ARG BUILD_ENV="local"
ARG BUILD_NUMBER=""
ARG IMAGE_TAG=""
ARG COMMIT_SHA=""
ARG BUILD_BRANCH=""
ARG BUILD_TIME=""
ARG RELEASE_VERSION=""
ARG SOURCE_IMAGE=""
ARG SOURCE_TAG=""
LABEL org.opencontainers.image.revision=$COMMIT_SHA \
      io.mungchilog.environment=$BUILD_ENV \
      io.mungchilog.source.image=$SOURCE_IMAGE \
      io.mungchilog.source.tag=$SOURCE_TAG
RUN BUILD_ENV="$BUILD_ENV" \
    BUILD_NUMBER="$BUILD_NUMBER" \
    IMAGE_TAG="$IMAGE_TAG" \
    COMMIT_SHA="$COMMIT_SHA" \
    BUILD_BRANCH="$BUILD_BRANCH" \
    BUILD_TIME="$BUILD_TIME" \
    RELEASE_VERSION="$RELEASE_VERSION" \
    node ./scripts/write-build-info.mjs
# node:sqlite is experimental on Node 22 (unflagged from Node 24+); pin this
# flag as long as the runtime stage stays on node:22-alpine.
ENV NODE_OPTIONS=--experimental-sqlite
EXPOSE 3000
CMD ["node", "dist/index.js"]
