import { Hono } from "hono";
import { db } from "../db.js";
import { requireAuth, requireApproved, requireAdmin, listUsers, setUserStatus, findUserById, type AuthEnv } from "../auth.js";

export const admin = new Hono<AuthEnv>();
admin.use("*", requireAuth, requireApproved, requireAdmin);

admin.get("/users", (c) => {
  return c.json(listUsers());
});

admin.post("/users/:id/approve", (c) => {
  const target = findUserById(c.req.param("id"));
  if (!target) return c.json({ error: "not found" }, 404);
  setUserStatus(target.id, "approved");
  return c.json({ ...target, status: "approved" });
});

// Rejects a still-pending signup by removing the account outright, rather
// than a "rejected" status - if they were rejected by mistake, logging in
// again just re-creates a fresh pending row (see auth.ts).
admin.delete("/users/:id", (c) => {
  const target = findUserById(c.req.param("id"));
  if (!target) return c.json({ error: "not found" }, 404);
  if (target.role === "admin") return c.json({ error: "can't remove an admin account" }, 400);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
  db.prepare("DELETE FROM trip_members WHERE user_id = ?").run(target.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(target.id);
  return c.json({ removed: true });
});
