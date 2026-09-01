import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  // .env lives at the repo root (jyje/mungchilog/.env), not apps/web/.env -
  // Vite only looks in its own root by default.
  envDir: "../..",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "뭉치로그",
        short_name: "뭉치로그",
        description: "여행 동선을 짜고 실시간으로 구글 지도로 확인하는 개인 여행 로그",
        theme_color: "#111214",
        background_color: "#111214",
        display: "standalone",
        start_url: "/trips",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // This file is replaced in the final image layer for each deployment.
        // It must always come from the currently running server, never PWA
        // precache or an older promoted image.
        globIgnores: ["build-info.js"],
        // Underground transit sections drop connectivity entirely: the
        // point of offline caching here is surviving that, not saving
        // API calls (see PLAN.md). Cache the app shell aggressively and
        // let GET /api/trips/* fall back to the last successful response.
        // OIDC needs real document navigations for both endpoints. Without
        // this exclusion Workbox returns the SPA shell for /auth/login and
        // /auth/callback, preventing the server from issuing or consuming
        // the OIDC session cookies.
        navigateFallbackDenylist: [/^\/auth(?:\/|$)/, /^\/api(?:\/|$)/],
        runtimeCaching: [
          {
            // Location sharing is ephemeral. Workbox can cache responses
            // despite HTTP no-store headers, so this must precede trips-api.
            urlPattern: ({ url }) => /^\/api\/trips\/[^/]+\/location-sharing(?:\/|$)/.test(url.pathname),
            handler: "NetworkOnly",
            method: "GET",
          },
          {
            urlPattern: /^\/api\/trips(\/.*)?$/,
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "trips-api",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      // OIDC starts and completes as ordinary server-side navigations
      // (/auth/login -> provider -> /auth/callback). Proxy this namespace
      // in development as well, otherwise the Vite server returns its SPA
      // fallback for both the login link and the current-user check.
      "/auth": "http://localhost:3000",
    },
  },
});
