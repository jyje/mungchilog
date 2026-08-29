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

// apps/web's build lands in ./public (see Dockerfile). Everything not
// matched above, including /trips and /trips/:id, falls through to
// index.html, and the client-side router in apps/web/src/App.tsx takes it
// from there.
app.use("/*", serveStatic({ root: publicRoot }));
app.get("*", serveStatic({ path: `${publicRoot}/index.html` }));

const port = Number(process.env.PORT ?? 3000);
console.log(`mungchilog server listening on :${port}`);

serve({ fetch: app.fetch, port });
