import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { trips } from "./routes/trips.js";

const app = new Hono();

app.get("/healthz", (c) => c.json({ status: "ok", service: "mungchilog-server" }));

app.route("/api/trips", trips);

// apps/web's build lands in ./public (see Dockerfile). Everything not
// matched above — including /trips and /trips/:id — falls through to
// index.html, and the client-side router in apps/web/src/App.tsx takes it
// from there.
app.use("/*", serveStatic({ root: "./public" }));
app.get("*", serveStatic({ path: "./public/index.html" }));

const port = Number(process.env.PORT ?? 3000);
console.log(`mungchilog server listening on :${port}`);

serve({ fetch: app.fetch, port });
