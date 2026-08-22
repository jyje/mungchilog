import { db } from "./db.js";

// Per-trip sharing (M6). "owner" created the trip (or adopted it via the
// admin-bootstrap backfill in auth.ts); "editor" was invited. Both can
// fully edit the itinerary - only "owner" (or a global admin) can delete
// the trip or change who else is on it.
export type TripRole = "owner" | "editor";

export async function getMembership(tripId: string, userId: string): Promise<TripRole | null> {
  const row = await db.get<{ role: string }>("SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?", [tripId, userId]);
  return row ? (row.role as TripRole) : null;
}

export async function addMember(tripId: string, userId: string, role: TripRole) {
  await db.run(
    `INSERT INTO trip_members (trip_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(trip_id, user_id) DO UPDATE SET role = excluded.role`,
    [tripId, userId, role, new Date().toISOString()],
  );
}

export async function removeMember(tripId: string, userId: string) {
  await db.run("DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?", [tripId, userId]);
}

export async function listMembers(tripId: string) {
  return await db.all<{ id: string; email: string; name: string | null; role: string }>(
      `SELECT u.id, u.email, u.name, tm.role FROM trip_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.trip_id = ?
       ORDER BY tm.role ASC, u.email ASC`,
    [tripId],
  );
}

export async function listMemberTripIds(userId: string): Promise<string[]> {
  return (await db.all<{ trip_id: string }>("SELECT trip_id FROM trip_members WHERE user_id = ?", [userId])).map((r) => r.trip_id);
}
