import { randomUUID } from "node:crypto";

export const LOCATION_TTL_MS = 60_000;
export const CONSENT_TTL_MS = 120_000;
export const SHARING_DURATIONS = [900, 3600, 14400] as const;

export function isLocationSharingEnabled(env: NodeJS.ProcessEnv = process.env) {
  // An explicit operational assertion is required. A single replica with a
  // rolling update is NOT single-process: overlapping pods break revocation.
  return env.LOCATION_SHARING_ENABLED === "true" && env.LOCATION_SHARING_SINGLE_PROCESS === "true";
}

export type Position = {
  lat: number;
  lng: number;
  accuracy: number;
  measuredAt: number;
  receivedAt: number;
  expiresAt: number;
};

export type SharingSession = {
  id: string;
  userId: string;
  authSessionId: string;
  authExpiresAt: number;
  tripId: string;
  audienceVersion: string;
  expiresAt: number;
  lastUpdateAt?: number;
  lastMeasuredAt?: number;
  position?: Position;
};

type Consent = {
  token: string;
  userId: string;
  authSessionId: string;
  tripId: string;
  audienceVersion: string;
  expiresAt: number;
};

/** Memory only. Never serialize this store or include its values in logs. */
export class LocationSharingStore {
  readonly sessions = new Map<string, SharingSession>();
  readonly consents = new Map<string, Consent>();
  private readonly rates = new Map<string, { count: number; expiresAt: number }>();
  private tail: Promise<void> = Promise.resolve();

  // Database authorization and app-controlled revocations share this queue.
  // No await may separate authorization and mutation outside this lock.
  async lock<T>(operation: () => Promise<T> | T): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      this.prune();
      return await operation();
    } finally {
      release();
    }
  }

  prune(now = Date.now()) {
    for (const [key, session] of this.sessions) {
      if (session.expiresAt <= now || session.authExpiresAt <= now) this.sessions.delete(key);
      else if (session.position && session.position.expiresAt <= now) delete session.position;
    }
    for (const [key, consent] of this.consents) {
      if (consent.expiresAt <= now) this.consents.delete(key);
    }
    for (const [key, rate] of this.rates) {
      if (rate.expiresAt <= now) this.rates.delete(key);
    }
  }

  allowRequest(userId: string, kind: "read" | "write") {
    const key = `${userId}:${kind}`;
    const now = Date.now();
    let rate = this.rates.get(key);
    if (!rate || rate.expiresAt <= now) {
      // Bound memory even when many authenticated accounts send requests.
      if (this.rates.size >= 10_000 && !rate) return false;
      rate = { count: 0, expiresAt: now + 60_000 };
      this.rates.set(key, rate);
    }
    return ++rate.count <= (kind === "read" ? 120 : 60);
  }

  issueConsent(input: Omit<Consent, "token" | "expiresAt">) {
    if (!this.consents.has(input.userId) && this.consents.size >= 1_000) return null;
    const consent = { ...input, token: randomUUID(), expiresAt: Date.now() + CONSENT_TTL_MS };
    // Only one pending confirmation per account. A second tab invalidates
    // the first intent instead of leaving a replayable consent capability.
    this.consents.set(input.userId, consent);
    return consent;
  }

  revokeTrip(tripId: string) {
    for (const [key, session] of this.sessions) if (session.tripId === tripId) this.sessions.delete(key);
    for (const [key, consent] of this.consents) if (consent.tripId === tripId) this.consents.delete(key);
  }

  revokeUser(userId: string) {
    this.sessions.delete(userId);
    this.consents.delete(userId);
  }

  revokeAuthSession(authSessionId: string) {
    for (const [key, session] of this.sessions) if (session.authSessionId === authSessionId) this.sessions.delete(key);
    for (const [key, consent] of this.consents) if (consent.authSessionId === authSessionId) this.consents.delete(key);
  }
}

export const locationSharingStore = new LocationSharingStore();

export function startLocationSharingCleanup() {
  if (!isLocationSharingEnabled()) return;
  // Reads and writes also prune. Delayed cleanup never makes stale locations
  // deliverable, and a restart drops all sharing and pending consent.
  const timer = setInterval(() => { void locationSharingStore.lock(() => {}); }, 5_000);
  timer.unref();
}
