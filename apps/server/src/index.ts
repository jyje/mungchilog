import "./dns-fix.js"; // must run before anything calls fetch() - see the file for why
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { trips } from "./routes/trips.js";
import { legs } from "./routes/legs.js";
import { places } from "./routes/places.js";
import { timezones } from "./routes/timezones.js";
import { admin } from "./routes/admin.js";
import { locationSharing } from "./routes/location-sharing.js";
import { startLocationSharingCleanup } from "./location-sharing-store.js";
import { auth, isAuthenticationReady, requireApproved, requireAuth, requireSameOrigin } from "./auth.js";
import { localWebPageRedirect } from "./local-web-origin.js";

const app = new Hono();
const publicRoot = process.env.WEB_PUBLIC_DIR ?? "./public";

app.get("/healthz", (c) => c.json({ status: "ok", service: "mungchilog-server" }));
app.get("/readyz", (c) =>
  isAuthenticationReady()
    ? c.json({ status: "ready", service: "mungchilog-server" })
    : c.json({ status: "not-ready", service: "mungchilog-server" }, 503),
);

app.route("/auth", auth);
// This router applies its own authentication, approval, CSRF and no-store
// boundary, including error responses, before the generic API middleware.
app.route("/api/trips", locationSharing);
startLocationSharingCleanup();
// Authentication is an application boundary, not just a trips-route
// concern. In particular, a newly created but unapproved account must not
// be able to call the Places or Routes endpoints directly, even though the
// trip routes themselves already enforce the same rule.
app.use("/api/*", requireSameOrigin, requireAuth, requireApproved);
app.route("/api/trips", trips);
app.route("/api/legs", legs);
app.route("/api/places", places);
app.route("/api/timezones", timezones);
app.route("/api/admin", admin);

// During local development the API server listens on :3000 while Vite owns
// the browser page on :5173. If a user opens a client route on :3000 directly,
// send only that page navigation to Vite. API, OIDC, health, and asset paths
// continue through the server and never enter this redirect.
app.get("*", async (c, next) => {
  const target = localWebPageRedirect(c.req.path, new URL(c.req.url).search, process.env);
  if (target) return c.redirect(target, 307);
  await next();
});

// This tiny public file is the only environment-specific image layer. It is
// intentionally not part of the PWA precache and must not outlive a rollout.
app.get("/build-info.js", serveStatic({
  root: publicRoot,
  onFound: (_path, c) => c.header("Cache-Control", "no-store, max-age=0"),
}));

// apps/web's build lands in ./public (see Dockerfile). Everything not
// matched above, including /trips and /trips/:id, falls through to
// index.html, and the client-side router in apps/web/src/App.tsx takes it
// from there.
app.use("/*", serveStatic({ root: publicRoot }));
app.get("*", serveStatic({ path: `${publicRoot}/index.html` }));

const port = Number(process.env.PORT ?? 3000);
console.log(`mungchilog server listening on :${port}`);

serve({ fetch: app.fetch, port });
