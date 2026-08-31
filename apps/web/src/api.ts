import type { Trip, TripData, TripSummary } from "./types";
import { clearPrivateCache } from "./queryClient";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// The backend being unreachable (pod down, NAT weirdness, ISP hiccup) must
// never leave the caller waiting forever - a bare `fetch` has no timeout of
// its own. Auth calls in particular gate a full-page redirect, so a hang
// here reads as a frozen app. `TimeoutError` lets callers show a distinct
// "can't reach the server" message instead of a generic failure.
export class TimeoutError extends Error {
  constructor(message = "요청이 너무 오래 걸립니다") {
    super(message);
    this.name = "TimeoutError";
  }
}

async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") throw new TimeoutError();
    throw err;
  }
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
  return fetchWithTimeout("/auth/me").then((r) => (r.status === 401 ? null : json<Me>(r)));
}

// The login page's own health check before it commits to a full-page
// redirect (see LoginPage.handleLogin): `/auth/me` has no side effects and
// always responds fast when the backend is up, whether or not the caller is
// signed in. A short timeout here so a dead backend surfaces in a few
// seconds instead of leaving the button spinning indefinitely.
//
// A network-level failure isn't the only way "down" shows up - in front of
// ingress-nginx, a dead pod answers with a completed 502/503/504, which
// `fetch` treats as a normal response rather than an error. Both cases must
// fail this check, or a redirect still goes through to a backend that can't
// serve it.
export async function pingBackend(timeoutMs = 4000): Promise<void> {
  const res = await fetchWithTimeout("/auth/me", {}, timeoutMs);
  if (res.status >= 500) throw new Error(`backend unavailable: ${res.status}`);
}

export async function logout(): Promise<void> {
  // Clear local itinerary data even if the network is already unavailable:
  // the server session may remain until it expires, but this browser must no
  // longer present the previous user's cached data as its own.
  try {
    await fetchWithTimeout("/auth/logout", { method: "POST" });
  } finally {
    await clearPrivateCache();
  }
}

export async function beginFreshLogin(): Promise<string> {
  // The server removes the app session and gives the browser the provider's
  // end-session URL. The caller waits for that logout document before it
  // starts the next PKCE flow.
  try {
    const response = await fetchWithTimeout("/auth/restart-login", { method: "POST" });
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

export type AdminUsageWindow = "24h" | "7d" | "30d";

export type AdminUsageService = {
  service: string;
  label: string;
  requests: number;
  errors: number;
  errorRate: number;
  latencyMs: { p50: number | null; p95: number | null };
  quota: { usage: number; limit: number; ratio: number } | null;
  trend: Array<{ at: string; requests: number; errors: number }>;
};

export type AdminUsage = {
  window: AdminUsageWindow;
  generatedAt: string;
  application: {
    users: { pending: number; approved: number };
    trips: number;
    memberships: number;
    routeCache: { entries: number; freshEntries: number };
    placeCache: { entries: number; freshEntries: number };
  };
  google:
    | { status: "disabled"; reason: "not-configured" }
    | { status: "unavailable"; reason: "provider-error" }
    | { status: "available"; sampledUntil: string; services: AdminUsageService[] };
};

export function adminGetUsage(window: AdminUsageWindow, refresh = false): Promise<AdminUsage> {
  return fetchWithTimeout(`/api/admin/usage?window=${window}${refresh ? "&refresh=1" : ""}`).then((r) => json(r));
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

// A routable endpoint: a Place ID when the stop came from Places, or a bare
// coordinate for a stop dropped straight onto the map (issue 46), which has
// no Place ID to offer.
export type LegWaypoint = { placeId: string } | { latLng: { latitude: number; longitude: number } };

export type LegRoute = {
  distanceM: number | null;
  durationS: number | null;
  fareAmount: number | null;
  fareCurrency: string | null;
  polyline: string | null;
  label: "DEFAULT_ROUTE" | "DEFAULT_ROUTE_ALTERNATE";
  // Server-computed fingerprint of this alternative. Persisted with the
  // user's choice so a cache refresh that reorders alternatives cannot
  // silently swap which journey is selected.
  key: string;
};

export type Leg = {
  routes: LegRoute[];
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
// `timingKind` tells the server which end of the journey `when` describes;
// ARRIVE_BY is transit-only and rejected for other modes.
export async function computeLeg(input: {
  from: LegWaypoint;
  to: LegWaypoint;
  mode: LegMode;
  when: string | undefined;
  timingKind: "AUTO" | "DEPART_AT" | "ARRIVE_BY";
  timezone: string;
  trafficAware: boolean;
}): Promise<Leg | null> {
  const res = await fetch("/api/legs/compute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, alternatives: true }),
  });
  if (res.status === 501) {
    const body = await res.json().catch(() => ({}));
    return body.cached ?? null;
  }
  return json<Leg>(res);
}
