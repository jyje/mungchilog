import type { Trip, TripData, TripSummary } from "./types";
import { clearPrivateCache } from "./queryClient";

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

export function lookupTimezone(lat: number, lng: number, date: string): Promise<{ timezone: string | null }> {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), date });
  return fetch(`/api/timezones?${params}`).then((r) => json(r));
}

// --- auth / M6 ---

export type Me = { id: string; email: string; name: string | null; status: "pending" | "approved"; role: "admin" | "member" };

export function getMe(): Promise<Me | null> {
  return fetch("/auth/me").then((r) => (r.status === 401 ? null : json<Me>(r)));
}

export async function logout(): Promise<void> {
  // Clear local itinerary data even if the network is already unavailable:
  // the server session may remain until it expires, but this browser must no
  // longer present the previous user's cached data as its own.
  try {
    await fetch("/auth/logout", { method: "POST" });
  } finally {
    await clearPrivateCache();
  }
}

export async function beginFreshLogin(): Promise<string> {
  // The server removes the app session and gives the browser the provider's
  // end-session URL. The caller waits for that logout document before it
  // starts the next PKCE flow.
  try {
    const response = await fetch("/auth/restart-login", { method: "POST" });
    const { logoutUrl } = await json<{ logoutUrl: string }>(response);
    return logoutUrl;
  } finally {
    await clearPrivateCache();
  }
}

export function adminListUsers(): Promise<Me[]> {
  return fetch("/api/admin/users").then((r) => json(r));
}

export function adminApproveUser(id: string): Promise<Me> {
  return fetch(`/api/admin/users/${id}/approve`, { method: "POST" }).then((r) => json(r));
}

export function adminRejectUser(id: string): Promise<{ removed: boolean }> {
  return fetch(`/api/admin/users/${id}`, { method: "DELETE" }).then((r) => json(r));
}

export type TripMember = { id: string; email: string; name: string | null; role: "owner" | "editor" };

export function listTripMembers(tripId: string): Promise<TripMember[]> {
  return fetch(`/api/trips/${tripId}/members`).then((r) => json(r));
}

export function inviteToTrip(tripId: string, email: string): Promise<{ invited: string }> {
  return fetch(`/api/trips/${tripId}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  }).then((r) => json(r));
}

export function removeTripMember(tripId: string, userId: string): Promise<{ removed: boolean }> {
  return fetch(`/api/trips/${tripId}/members/${userId}`, { method: "DELETE" }).then((r) => json(r));
}

export type SharedLocation = {
  userId: string;
  lat: number;
  lng: number;
  accuracy: number;
  measuredAt: number;
  receivedAt: number;
  expiresAt: number;
  sharingExpiresAt: number;
};
export type LocationSharingConsent = {
  consentToken: string;
  consentExpiresAt: number;
  audienceVersion: string;
  recipients: Pick<TripMember, "id" | "name">[];
  durationOptions: number[];
  defaultDurationSeconds: number;
  viewersNeedNotShare: boolean;
};
export type LocationSharingPoll = {
  serverTime: number;
  recipients: Pick<TripMember, "id" | "name">[];
  locations: SharedLocation[];
  ownSharing: { tripId: string; expiresAt: number; sameLoginSession: boolean } | null;
};

const locationSharingUrl = (tripId: string) => `/api/trips/${tripId}/location-sharing`;

export function getLocationSharingConsent(tripId: string): Promise<LocationSharingConsent> {
  return fetch(`${locationSharingUrl(tripId)}/consent`, { cache: "no-store" }).then((r) => json(r));
}
export function startLocationSharing(tripId: string, input: { consentToken: string; audienceVersion: string; durationSeconds: number; takeover: boolean }) {
  return fetch(locationSharingUrl(tripId), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, consent: true }),
  }).then((r) => json<{ sharingSessionId: string; expiresAt: number }>(r));
}
export function updateLocationSharing(tripId: string, input: { sharingSessionId: string; lat: number; lng: number; accuracy: number; measuredAt: number }) {
  return fetch(locationSharingUrl(tripId), {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }).then((r) => json<{ expiresAt: number }>(r));
}
export function getLocationSharing(tripId: string): Promise<LocationSharingPoll> {
  return fetch(locationSharingUrl(tripId), { cache: "no-store" }).then((r) => json(r));
}
export function stopLocationSharing(tripId: string, sharingSessionId: string) {
  return fetch(locationSharingUrl(tripId), {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sharingSessionId }),
  }).then((r) => json<{ stopped: boolean }>(r));
}

export type LegMode = "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT" | "TWO_WHEELER";

export type Leg = {
  distanceM: number | null;
  durationS: number | null;
  fareAmount: number | null;
  fareCurrency: string | null;
  polyline: string | null;
  fetchedAt: string;
};

// 501 means the server key isn't configured yet (see docs/google-maps-setup.md) -
// that is an expected, temporary state, not a real error. Callers should
// treat it as "no data yet", not surface it as a failure.
//
// `when` (ISO 8601) matters even before the key exists: the server picks
// its cache bucket from it, and TRANSIT schedules genuinely differ by
// weekday/time. Omitting it defaults to "now", which is wrong for any
// itinerary day that isn't literally today (see PR jyje/cluster#55).
export async function computeLeg(
  fromPlaceId: string,
  toPlaceId: string,
  mode: LegMode,
  when: string | undefined,
  timezone: string,
): Promise<Leg | null> {
  const res = await fetch("/api/legs/compute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromPlaceId, toPlaceId, mode, when, timezone }),
  });
  if (res.status === 501) {
    const body = await res.json().catch(() => ({}));
    return body.cached ?? null;
  }
  return json<Leg>(res);
}
