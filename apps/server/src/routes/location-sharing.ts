import { createHash, randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { db } from "../db.js";
import { getCurrentUser, getCurrentSessionStorageId, requireSameOrigin, type AuthEnv } from "../auth.js";
import {
  isLocationSharingEnabled, LOCATION_TTL_MS, SHARING_DURATIONS, locationSharingStore as store,
  type SharingSession,
} from "../location-sharing-store.js";

const startSchema = z.object({
  consentToken: z.string().uuid(),
  audienceVersion: z.string().length(64),
  consent: z.literal(true),
  durationSeconds: z.union([z.literal(900), z.literal(3600), z.literal(14400)]).default(3600),
  takeover: z.boolean().default(false),
}).strict();
const stopSchema = z.object({ sharingSessionId: z.string().uuid() }).strict();
const positionSchema = stopSchema.extend({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(100_000),
  measuredAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();

type Recipient = { id: string; name: string | null; role: string; status: string; created_at: string };
type Access = {
  userId: string;
  authSessionId: string;
  authExpiresAt: number;
  tripId: string;
  audienceVersion: string;
  recipients: Recipient[];
};

export const locationSharing = new Hono<AuthEnv>().basePath("/:id/location-sharing");
locationSharing.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store, max-age=0");
  c.header("Pragma", "no-cache");
  c.header("Vary", "Cookie, Origin");
  if (!isLocationSharingEnabled()) return c.json({ error: "location sharing is unavailable" }, 503);
  // No location fields, consent tokens, or sender capabilities belong in URLs.
  if (new URL(c.req.url).search) return c.json({ error: "query parameters are not accepted" }, 400);
  await next();
});
locationSharing.use("*", requireSameOrigin);
locationSharing.use("*", bodyLimit({ maxSize: 1024, onError: (c) => c.json({ error: "payload too large" }, 413) }));
locationSharing.use("*", async (c, next) => {
  if (["POST", "PUT", "DELETE"].includes(c.req.method) &&
    c.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return c.json({ error: "JSON content type required" }, 415);
  }
  await next();
});
// Never log location request bodies or exception objects that could contain
// them. This route returns fixed, non-reflecting error messages only.
locationSharing.onError((_error, c) => c.json({ error: "location sharing request failed" }, 500));

async function withAccess(c: Context<AuthEnv>, operation: (access: Access) => Response | Promise<Response>) {
  return store.lock(async () => {
    // This is deliberately repeated inside the serialization boundary, after
    // body parsing. A logout/removal while the body was in flight must win.
    const user = await getCurrentUser(c);
    const authSessionId = getCurrentSessionStorageId(c);
    if (!user || !authSessionId) return c.json({ error: "login required" }, 401);
    if (user.status !== "approved") return c.json({ error: "account pending admin approval" }, 403);
    const tripId = c.req.param("id");
    if (!tripId) return c.json({ error: "not found" }, 404);
    const recipients = await db.all<Recipient>(
      `SELECT u.id, u.name, u.status, tm.role, tm.created_at FROM trip_members tm
       JOIN users u ON u.id = tm.user_id JOIN trips t ON t.id = tm.trip_id
       WHERE tm.trip_id = ? ORDER BY u.id`, [tripId],
    );
    if (!recipients.some((recipient) => recipient.id === user.id)) return c.json({ error: "not found" }, 404);
    // Consent is tied to the current identities, roles, approval states and
    // membership creation times, not just the number of participants.
    const audienceVersion = createHash("sha256").update(JSON.stringify(recipients.map(
      ({ id, name, role, status, created_at }) => [id, name, role, status, created_at],
    ))).digest("hex");
    for (const session of store.sessions.values()) {
      if (session.tripId !== tripId) continue;
      if (session.audienceVersion !== audienceVersion) {
        store.revokeTrip(tripId);
        break;
      }
      const valid = await db.get<{ expires_at: string }>(
        `SELECT s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.user_id = ? AND s.expires_at > ? AND u.status = 'approved'`,
        [session.authSessionId, session.userId, new Date().toISOString()],
      );
      if (!valid || !Number.isFinite(Date.parse(valid.expires_at))) store.revokeUser(session.userId);
      else {
        session.authExpiresAt = Date.parse(valid.expires_at);
        // Administrative session shortening must also shorten the deadline
        // already advertised to polling clients, never extend consent.
        session.expiresAt = Math.min(session.expiresAt, session.authExpiresAt);
        if (session.position) session.position.expiresAt = Math.min(session.position.expiresAt, session.expiresAt);
      }
    }
    const caller = await db.get<{ expires_at: string; status: string }>(
      `SELECT s.expires_at, u.status FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.user_id = ?`, [authSessionId, user.id],
    );
    const authExpiresAt = caller ? Date.parse(caller.expires_at) : 0;
    if (!Number.isFinite(authExpiresAt) || authExpiresAt <= Date.now()) return c.json({ error: "login required" }, 401);
    if (caller?.status !== "approved") return c.json({ error: "account pending admin approval" }, 403);
    // SQL awaits may have crossed an expiry boundary.
    store.prune();
    if (c.req.method !== "DELETE" && !store.allowRequest(user.id, c.req.method === "GET" ? "read" : "write")) {
      c.header("Retry-After", "60");
      return c.json({ error: "too many location requests" }, 429);
    }
    return operation({ userId: user.id, authSessionId, authExpiresAt, tripId, audienceVersion, recipients });
  });
}

function recipientList(access: Access) {
  return access.recipients.map(({ id, name }) => ({ id, name }));
}

function ownSender(access: Access, sharingSessionId: string): SharingSession | undefined {
  const session = store.sessions.get(access.userId);
  return session?.id === sharingSessionId && session.tripId === access.tripId &&
    session.authSessionId === access.authSessionId ? session : undefined;
}

// Fetch only when opening an explicit confirmation dialog, not on every poll.
locationSharing.get("/consent", (c) => withAccess(c, (access) => {
  const consent = store.issueConsent({
    userId: access.userId, authSessionId: access.authSessionId,
    tripId: access.tripId, audienceVersion: access.audienceVersion,
  });
  if (!consent) return c.json({ error: "location sharing capacity reached" }, 503);
  return c.json({
    consentToken: consent.token, consentExpiresAt: consent.expiresAt,
    audienceVersion: access.audienceVersion, recipients: recipientList(access),
    durationOptions: SHARING_DURATIONS, defaultDurationSeconds: 3600,
    viewersNeedNotShare: true,
  });
}));

locationSharing.get("/", (c) => withAccess(c, (access) => {
  const own = store.sessions.get(access.userId);
  const locations = [...store.sessions.values()]
    .filter((session) => session.tripId === access.tripId && session.position)
    .map((session) => ({ userId: session.userId, ...session.position!, sharingExpiresAt: session.expiresAt }));
  return c.json({
    serverTime: Date.now(), audienceVersion: access.audienceVersion, recipients: recipientList(access), locations,
    ownSharing: own ? { tripId: own.tripId, expiresAt: own.expiresAt, sameLoginSession: own.authSessionId === access.authSessionId } : null,
  });
}));

locationSharing.post("/", async (c) => {
  const parsed = startSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid sharing confirmation" }, 400);
  return withAccess(c, (access) => {
    const input = parsed.data;
    const consent = store.consents.get(access.userId);
    if (!consent || consent.token !== input.consentToken || consent.tripId !== access.tripId ||
      consent.authSessionId !== access.authSessionId || consent.audienceVersion !== access.audienceVersion ||
      input.audienceVersion !== access.audienceVersion) {
      return c.json({ error: "recipient confirmation expired or changed" }, 409);
    }
    if (store.sessions.has(access.userId) && !input.takeover) {
      return c.json({ error: "sharing already active; explicit takeover required" }, 409);
    }
    if (!store.sessions.has(access.userId) && store.sessions.size >= 1_000) {
      return c.json({ error: "location sharing capacity reached" }, 503);
    }
    store.consents.delete(access.userId);
    const session: SharingSession = {
      id: randomUUID(), userId: access.userId, authSessionId: access.authSessionId, authExpiresAt: access.authExpiresAt,
      tripId: access.tripId, audienceVersion: access.audienceVersion,
      expiresAt: Math.min(Date.now() + input.durationSeconds * 1000, access.authExpiresAt),
    };
    store.sessions.set(access.userId, session);
    return c.json({ sharingSessionId: session.id, expiresAt: session.expiresAt, coordinateTtlSeconds: 60 }, 201);
  });
});

locationSharing.put("/", async (c) => {
  const parsed = positionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid position" }, 400);
  return withAccess(c, (access) => {
    const input = parsed.data;
    const session = ownSender(access, input.sharingSessionId);
    if (!session) return c.json({ error: "sharing session ended" }, 409);
    const now = Date.now();
    if (input.measuredAt < now - 30_000 || input.measuredAt > now + 5_000 ||
      (session.lastMeasuredAt !== undefined && input.measuredAt <= session.lastMeasuredAt)) {
      return c.json({ error: "stale or invalid measurement time" }, 400);
    }
    if (session.lastUpdateAt !== undefined && now - session.lastUpdateAt < 2_000) {
      c.header("Retry-After", "2");
      return c.json({ error: "location updates must be at least two seconds apart" }, 429);
    }
    session.lastUpdateAt = now;
    session.lastMeasuredAt = input.measuredAt;
    session.position = {
      lat: input.lat, lng: input.lng, accuracy: input.accuracy, measuredAt: input.measuredAt,
      receivedAt: now, expiresAt: Math.min(now + LOCATION_TTL_MS, session.expiresAt, session.authExpiresAt),
    };
    return c.json({ receivedAt: now, expiresAt: session.position.expiresAt });
  });
});

// Also used for an explicit trip-departure notification. Stop is never rate
// limited, so a busy client can always revoke an otherwise valid sender.
locationSharing.delete("/", async (c) => {
  const parsed = stopSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid sharing session" }, 400);
  return withAccess(c, (access) => {
    if (!ownSender(access, parsed.data.sharingSessionId)) return c.json({ error: "sharing session ended" }, 409);
    store.revokeUser(access.userId);
    return c.json({ stopped: true });
  });
});
