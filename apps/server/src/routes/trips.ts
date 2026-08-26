import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { db } from "../db.js";
import { TripImportSchema, type TripData } from "../schema.js";
import { requireAuth, requireApproved, findUserByEmail, type AuthEnv } from "../auth.js";
import { getMembership, addMember, removeMember, listMembers, listMemberTripIds } from "../membership.js";
import { locationSharingStore } from "../location-sharing-store.js";

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

type TripCoverSpot = {
  id: string;
  name: string;
  nameLocal?: string;
  lat?: number;
  lng?: number;
};

function tripCoverSummary(data: TripData) {
  if (!data.cover) return null;
  const spot = data.cover.spotId
    ? data.days.flatMap((day) => day.spots).find((candidate) => candidate.id === data.cover?.spotId)
    : undefined;
  const coverSpot: TripCoverSpot | undefined = spot
    ? { id: spot.id, name: spot.name, nameLocal: spot.nameLocal, lat: spot.lat, lng: spot.lng }
    : undefined;
  return { imageDataUrl: data.cover.imageDataUrl, spot: coverSpot };
}

// Takes the whole trip itinerary as one JSON blob. This endpoint comes
// before any input UI: that screen only gets used once before departure,
// so it isn't worth the dev time (see PLAN.md).
trips.post("/import", async (c) => {
  const user = c.get("user");
  const contentLength = Number(c.req.header("Content-Length") ?? 0);
  // Keep submitted trip data bounded until image storage moves out of the
  // itinerary payload, instead of letting one request consume unbounded
  // server memory.
  if (Number.isFinite(contentLength) && contentLength > 3 * 1024 * 1024) {
    return c.json({ error: "trip payload must not exceed 3 MiB" }, 413);
  }
  const body = await c.req.json().catch(() => null);
  if (body === null) return c.json({ error: "invalid JSON body" }, 400);

  const parsed = TripImportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation failed", issues: parsed.error.issues }, 400);
  }

  const { id: providedId, ...submittedData } = parsed.data;

  // Updating an existing trip requires being a member (owner or editor) -
  // otherwise an approved-but-unrelated user who happens to know/guess a
  // trip's id could overwrite someone else's itinerary. A brand new trip
  // (no id, or an id nobody owns yet) is always allowed - the creator
  // becomes its owner below.
  if (providedId) {
    const existingOwned = await db.get("SELECT 1 FROM trips WHERE id = ?", [providedId]);
    if (existingOwned && !(await getMembership(providedId, user.id))) {
      return c.json({ error: "not found" }, 404);
    }
  }

  const id = providedId ?? randomUUID();
  const now = new Date().toISOString();

  const existing = await db.get<Pick<TripRow, "created_at" | "data">>("SELECT created_at, data FROM trips WHERE id = ?", [id]);
  // A legacy JSON import has no cover field. Preserve a cover in that case,
  // but honor an explicit null from the cover editor as a deliberate clear.
  const existingData = existing ? (JSON.parse(existing.data) as TripData) : undefined;
  const data: TripData = submittedData.cover === undefined && existingData?.cover !== undefined
    ? { ...submittedData, cover: existingData.cover }
    : submittedData;

  await db.run(
    `INSERT INTO trips (id, title, start_date, end_date, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       data = excluded.data,
       updated_at = excluded.updated_at`,
    [id, data.title, data.startDate, data.endDate, JSON.stringify(data), existing?.created_at ?? now, now],
  );

  if (!existing) await addMember(id, user.id, "owner");

  return c.json({ id, updated: !!existing }, existing ? 200 : 201);
});

trips.get("/", async (c) => {
  const user = c.get("user");
  const memberTripIds = await listMemberTripIds(user.id);
  if (memberTripIds.length === 0) return c.json([]);
  const placeholders = memberTripIds.map(() => "?").join(",");
  const rows = await db.all<Pick<TripRow, "id" | "title" | "start_date" | "end_date" | "data">>(
    `SELECT id, title, start_date, end_date, data FROM trips WHERE id IN (${placeholders}) ORDER BY updated_at DESC`,
    memberTripIds,
  );
  return c.json(
    rows.map((r) => {
      const data = JSON.parse(r.data) as TripData;
      return { id: r.id, title: r.title, startDate: r.start_date, endDate: r.end_date, cover: tripCoverSummary(data) };
    }),
  );
});

trips.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  // Not a member -> 404, not 403: doesn't confirm the trip even exists.
  const membership = await getMembership(id, user.id);
  if (!membership) return c.json({ error: "not found" }, 404);
  const row = await db.get<TripRow>("SELECT * FROM trips WHERE id = ?", [id]);
  if (!row) return c.json({ error: "not found" }, 404);
  const data = JSON.parse(row.data) as TripData;
  return c.json({ id: row.id, ...data, myRole: membership });
});

trips.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await getMembership(id, user.id);
  if (!role) return c.json({ error: "not found" }, 404);
  if (role !== "owner" && user.role !== "admin") return c.json({ error: "only the owner can delete this trip" }, 403);
  const result = await locationSharingStore.lock(async () => {
    locationSharingStore.revokeTrip(id);
    // Remove referencing rows first with foreign-key enforcement enabled.
    await db.run("DELETE FROM trip_members WHERE trip_id = ?", [id]);
    return db.run("DELETE FROM trips WHERE id = ?", [id]);
  });
  if (result.changes === 0) return c.json({ error: "not found" }, 404);
  return c.json({ deleted: true });
});

// --- sharing ---

trips.get("/:id/members", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!(await getMembership(id, user.id))) return c.json({ error: "not found" }, 404);
  return c.json(await listMembers(id));
});

trips.post("/:id/invite", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await getMembership(id, user.id);
  if (!role) return c.json({ error: "not found" }, 404);
  if (role !== "owner" && user.role !== "admin") {
    return c.json({ error: "only the owner (or an admin) can invite people to this trip" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return c.json({ error: "email is required" }, 400);

  const invitee = await findUserByEmail(email);
  if (!invitee) return c.json({ error: "no account with that email has logged in yet" }, 404);
  if (invitee.status !== "approved") return c.json({ error: "that user is still pending admin approval" }, 409);

  await addMember(id, invitee.id, "editor");
  return c.json({ invited: invitee.email }, 201);
});

trips.delete("/:id/members/:userId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const role = await getMembership(id, user.id);
  if (!role) return c.json({ error: "not found" }, 404);
  if (role !== "owner" && user.role !== "admin") {
    return c.json({ error: "only the owner (or an admin) can remove people from this trip" }, 403);
  }
  const targetUserId = c.req.param("userId");
  if ((await getMembership(id, targetUserId)) === "owner") {
    return c.json({ error: "can't remove the owner" }, 400);
  }
  await removeMember(id, targetUserId);
  return c.json({ removed: true });
});
