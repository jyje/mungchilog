import { db } from "./db.js";

// Per-trip sharing (M6). "owner" created the trip (or adopted it via the
// admin-bootstrap backfill in auth.ts); "editor" was invited. Both can
// fully edit the itinerary - only "owner" (or a global admin) can delete
// the trip or change who else is on it.
export type TripRole = "owner" | "editor";

export function getMembership(tripId: string, userId: string): TripRole | null {
  const row = db.prepare("SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?").get(tripId, userId) as
    | { role: string }
    | undefined;
  return row ? (row.role as TripRole) : null;
}

export function addMember(tripId: string, userId: string, role: TripRole) {
  db.prepare(
    `INSERT INTO trip_members (trip_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(trip_id, user_id) DO UPDATE SET role = excluded.role`,
  ).run(tripId, userId, role, new Date().toISOString());
}

export function removeMember(tripId: string, userId: string) {
  db.prepare("DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?").run(tripId, userId);
}

export function listMembers(tripId: string) {
  return db
    .prepare(
      `SELECT u.id, u.email, u.name, tm.role FROM trip_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.trip_id = ?
       ORDER BY tm.role ASC, u.email ASC`,
    )
    .all(tripId) as { id: string; email: string; name: string | null; role: string }[];
}

export function listMemberTripIds(userId: string): string[] {
  return (db.prepare("SELECT trip_id FROM trip_members WHERE user_id = ?").all(userId) as { trip_id: string }[]).map(
    (r) => r.trip_id,
  );
}
