import type { Trip, TripData, TripSummary } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function listTrips(): Promise<TripSummary[]> {
  return fetch("/api/trips").then((r) => json(r));
}

export function getTrip(id: string): Promise<Trip> {
  return fetch(`/api/trips/${id}`).then((r) => json(r));
}

// Also used to persist edits (reorder, checklist toggles): the server
// upserts by id, so saving is just importing again with the same id.
export function saveTrip(data: TripData & { id?: string }): Promise<{ id: string; updated: boolean }> {
  return fetch("/api/trips/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((r) => json(r));
}

export function deleteTrip(id: string): Promise<{ deleted: boolean }> {
  return fetch(`/api/trips/${id}`, { method: "DELETE" }).then((r) => json(r));
}
