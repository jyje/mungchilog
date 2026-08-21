import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { db } from "../db.js";
import { TripImportSchema, type TripData } from "../schema.js";

export const trips = new Hono();

type TripRow = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  data: string;
  created_at: string;
  updated_at: string;
};

// Takes the whole trip itinerary as one JSON blob. This endpoint comes
// before any input UI — that screen only gets used once before departure,
// so it isn't worth the dev time (see PLAN.md).
trips.post("/import", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (body === null) return c.json({ error: "invalid JSON body" }, 400);

  const parsed = TripImportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);
  }

  const { id: providedId, ...data } = parsed.data;
  const id = providedId ?? randomUUID();
  const now = new Date().toISOString();

  const existing = db
    .prepare("SELECT created_at FROM trips WHERE id = ?")
    .get(id) as { created_at: string } | undefined;

  db.prepare(
    `INSERT INTO trips (id, title, start_date, end_date, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       data = excluded.data,
       updated_at = excluded.updated_at`,
  ).run(
    id,
    data.title,
    data.startDate,
    data.endDate,
    JSON.stringify(data),
    existing?.created_at ?? now,
    now,
  );

  return c.json({ id, updated: !!existing }, existing ? 200 : 201);
});

trips.get("/", (c) => {
  const rows = db
    .prepare("SELECT id, title, start_date, end_date FROM trips ORDER BY updated_at DESC")
    .all() as Pick<TripRow, "id" | "title" | "start_date" | "end_date">[];
  return c.json(rows.map((r) => ({ id: r.id, title: r.title, startDate: r.start_date, endDate: r.end_date })));
});

trips.get("/:id", (c) => {
  const row = db.prepare("SELECT * FROM trips WHERE id = ?").get(c.req.param("id")) as TripRow | undefined;
  if (!row) return c.json({ error: "not found" }, 404);
  const data = JSON.parse(row.data) as TripData;
  return c.json({ id: row.id, ...data });
});

export function getTripRow(id: string) {
  return db.prepare("SELECT * FROM trips WHERE id = ?").get(id) as TripRow | undefined;
}

export function listTripRows() {
  return db
    .prepare("SELECT id, title, start_date, end_date FROM trips ORDER BY updated_at DESC")
    .all() as Pick<TripRow, "id" | "title" | "start_date" | "end_date">[];
}
