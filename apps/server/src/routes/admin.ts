import { Hono } from "hono";
import { db } from "../db.js";
import { requireAuth, requireApproved, requireAdmin, listUsers, setUserStatus, findUserById, type AuthEnv } from "../auth.js";
import { locationSharingStore } from "../location-sharing-store.js";
import { readApplicationUsage, USAGE_WINDOWS, type AdminUsageResponse, type UsageWindow } from "../admin-usage.js";

export const admin = new Hono<AuthEnv>();
admin.use("*", requireAuth, requireApproved, requireAdmin);

admin.get("/users", async (c) => {
  return c.json(await listUsers());
});

admin.get("/usage", async (c) => {
  const window = c.req.query("window") ?? "24h";
  if (!USAGE_WINDOWS.includes(window as UsageWindow)) {
    return c.json({ error: `window must be one of: ${USAGE_WINDOWS.join(", ")}` }, 400);
  }

  const generatedAt = new Date();
  const response: AdminUsageResponse = {
    window: window as UsageWindow,
    generatedAt: generatedAt.toISOString(),
    application: await readApplicationUsage(db, generatedAt),
    google: { status: "disabled", reason: "not-configured" },
  };
  c.header("Cache-Control", "private, no-store");
  return c.json(response);
});

admin.post("/users/:id/approve", async (c) => {
  const target = await findUserById(c.req.param("id"));
  if (!target) return c.json({ error: "not found" }, 404);
  await setUserStatus(target.id, "approved");
  return c.json({ ...target, status: "approved" });
});

// Rejects a still-pending signup by removing the account outright, rather
// than a "rejected" status - if they were rejected by mistake, logging in
// again just re-creates a fresh pending row (see auth.ts).
admin.delete("/users/:id", async (c) => {
  const target = await findUserById(c.req.param("id"));
  if (!target) return c.json({ error: "not found" }, 404);
  if (target.role === "admin") return c.json({ error: "can't remove an admin account" }, 400);
  await locationSharingStore.lock(async () => {
    locationSharingStore.revokeUser(target.id);
    const memberships = await db.all<{ trip_id: string }>("SELECT trip_id FROM trip_members WHERE user_id = ?", [target.id]);
    for (const membership of memberships) locationSharingStore.revokeTrip(membership.trip_id);
    await db.run("DELETE FROM sessions WHERE user_id = ?", [target.id]);
    await db.run("DELETE FROM trip_members WHERE user_id = ?", [target.id]);
    await db.run("DELETE FROM users WHERE id = ?", [target.id]);
  });
  return c.json({ removed: true });
});
