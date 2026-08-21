import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { trips, getTripRow, listTripRows } from "./routes/trips.js";
import { renderTripListPage, renderTripDayPage } from "./render.js";
import type { TripData } from "./schema.js";

const app = new Hono();

app.get("/healthz", (c) => c.json({ status: "ok", service: "mungchilog-server" }));

app.route("/api/trips", trips);

// M1 placeholder screens (no React yet). Replaced once apps/web lands in M2.
app.get("/trips", (c) => c.html(renderTripListPage(listTripRows())));
app.get("/trips/:id", (c) => {
  const row = getTripRow(c.req.param("id"));
  if (!row) return c.text("not found", 404);
  const data = JSON.parse(row.data) as TripData;
  return c.html(renderTripDayPage(row.id, data));
});

app.use("/*", serveStatic({ root: "./public" }));
app.get("*", serveStatic({ path: "./public/index.html" }));

const port = Number(process.env.PORT ?? 3000);
console.log(`mungchilog server listening on :${port}`);

serve({ fetch: app.fetch, port });
