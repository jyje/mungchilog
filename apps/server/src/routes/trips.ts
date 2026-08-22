import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { db } from "../db.js";
import { TripImportSchema, type TripData } from "../schema.js";
import { requireAuth, requireApproved, findUserByEmail, type AuthEnv } from "../auth.js";
import { getMembership, addMember, removeMember, listMembers, listMemberTripIds } from "../membership.js";

export const trips = new Hono<AuthEnv>();

trips.use("*", requireAuth, requireApproved);

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
// before any input UI: that screen only gets used once before departure,
// so it isn't worth the dev time (see PLAN.md).
trips.post("/import", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  if (body === null) return c.json({ error: "invalid JSON body" }, 400);

  const parsed = TripImportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);
  }

  const { id: providedId, ...data } = parsed.data;

  // Updating an existing trip requires being a member (owner or editor) -
  // otherwise an approved-but-unrelated user who happens to know/guess a
  // trip's id could overwrite someone else's itinerary. A brand new trip
  // (no id, or an id nobody owns yet) is always allowed - the creator
  // becomes its owner below.
  if (providedId) {
    const existingOwned = db.prepare("SELECT 1 FROM trips WHERE id = ?").get(providedId);
    if (existingOwned && !getMembership(providedId, user.id)) {
      return c.json({ error: "not found" }, 404);
    }
  }

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

  if (!existing) addMember(id, user.id, "owner");

  return c.json({ id, updated: !!existing }, existing ? 200 : 201);
});

trips.get("/", (c) => {
  const user = c.get("user");
  const memberTripIds = listMemberTripIds(user.id);
  if (memberTripIds.length === 0) return c.json([]);
  const placeholders = memberTripIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT id, title, start_date, end_date FROM trips WHERE id IN (${placeholders}) ORDER BY updated_at DESC`)
    .all(...memberTripIds) as Pick<TripRow, "id" | "title" | "start_date" | "end_date">[];
  return c.json(rows.map((r) => ({ id: r.id, title: r.title, startDate: r.start_date, endDate: r.end_date })));
});

trips.get("/:id", (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  // Not a member -> 404, not 403: doesn't confirm the trip even exists.
  if (!getMembership(id, user.id)) return c.json({ error: "not found" }, 404);
  const row = db.prepare("SELECT * FROM trips WHERE id = ?").get(id) as TripRow | undefined;
  if (!row) return c.json({ error: "not found" }, 404);
  const data = JSON.parse(row.data) as TripData;
  return c.json({ id: row.id, ...data, myRole: getMembership(id, user.id) });
});

trips.delete("/:id", (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = getMembership(id, user.id);
  if (!role) return c.json({ error: "not found" }, 404);
  if (role !== "owner" && user.role !== "admin") return c.json({ error: "only the owner can delete this trip" }, 403);
  const result = db.prepare("DELETE FROM trips WHERE id = ?").run(id);
  db.prepare("DELETE FROM trip_members WHERE trip_id = ?").run(id);
  if (result.changes === 0) return c.json({ error: "not found" }, 404);
  return c.json({ deleted: true });
});

// --- sharing ---

trips.get("/:id/members", (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!getMembership(id, user.id)) return c.json({ error: "not found" }, 404);
  return c.json(listMembers(id));
});

trips.post("/:id/invite", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = getMembership(id, user.id);
  if (!role) return c.json({ error: "not found" }, 404);
  if (role !== "owner" && user.role !== "admin") {
    return c.json({ error: "only the owner (or an admin) can invite people to this trip" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return c.json({ error: "email is required" }, 400);

  const invitee = findUserByEmail(email);
  if (!invitee) return c.json({ error: "no account with that email has logged in yet" }, 404);
  if (invitee.status !== "approved") return c.json({ error: "that user is still pending admin approval" }, 409);

  addMember(id, invitee.id, "editor");
  return c.json({ invited: invitee.email }, 201);
});

trips.delete("/:id/members/:userId", (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = getMembership(id, user.id);
  if (!role) return c.json({ error: "not found" }, 404);
  if (role !== "owner" && user.role !== "admin") {
    return c.json({ error: "only the owner (or an admin) can remove people from this trip" }, 403);
  }
  const targetUserId = c.req.param("userId");
  if (getMembership(id, targetUserId) === "owner") {
    return c.json({ error: "can't remove the owner" }, 400);
  }
  removeMember(id, targetUserId);
  return c.json({ removed: true });
});
