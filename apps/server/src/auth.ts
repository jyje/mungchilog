import { randomBytes, randomUUID } from "node:crypto";
import * as oidc from "openid-client";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db } from "./db.js";

// Standard OIDC login, configured entirely via env vars so this works with
// any compliant provider (Authentik, Keycloak, Google Workspace, ...) -
// nothing here is Authentik-specific. See docs/authentik-setup.md for how
// jyje's own instance is wired up, and .env.sample for what to set.
const ISSUER_URL = process.env.OIDC_ISSUER_URL;
const CLIENT_ID = process.env.OIDC_CLIENT_ID;
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
const REDIRECT_URI = process.env.OIDC_REDIRECT_URI;
// Whoever owns this email is auto-approved as admin the moment they first
// log in - no manual DB edit needed to bootstrap the very first account.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

const OIDC_CONFIGURED = !!(ISSUER_URL && CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
const SESSION_COOKIE = "mungchilog_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SECURE_COOKIES = process.env.NODE_ENV === "production";

// Threaded through every router that stacks requireAuth, so c.get("user")
// type-checks without a manual cast (see routes/trips.ts).
export type AuthEnv = { Variables: { user: User } };

export type User = {
  id: string;
  email: string;
  name: string | null;
  status: "pending" | "approved";
  role: "admin" | "member";
};

type UserRow = { id: string; email: string; name: string | null; status: string; role: string };

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status === "approved" ? "approved" : "pending",
    role: row.role === "admin" ? "admin" : "member",
  };
}

// Single fixed pseudo-user for local dev when no OIDC provider is
// configured (mirrors how the Google Maps integration degrades to a
// placeholder/plain-text-input when its keys aren't set, rather than
// hard-failing): keeps `npm run dev` usable without standing up an IdP,
// while production (env vars present) always enforces real login.
const DEV_USER: User = { id: "dev-local", email: ADMIN_EMAIL ?? "dev@localhost", name: "Local Dev", status: "approved", role: "admin" };

async function bootstrapDevUser() {
  // Make sure the pseudo-user row exists and owns whatever trips are
  // already sitting in the local dev DB, so M6's per-trip membership
  // filtering doesn't suddenly hide pre-existing local test data.
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO users (id, email, name, status, role, created_at) VALUES (?, ?, ?, 'approved', 'admin', ?)
     ON CONFLICT(id) DO NOTHING`,
    [DEV_USER.id, DEV_USER.email, DEV_USER.name, now],
  );
  const orphanTrips = await db.all<{ id: string }>("SELECT id FROM trips WHERE id NOT IN (SELECT trip_id FROM trip_members)");
  for (const t of orphanTrips) {
    await db.run("INSERT INTO trip_members (trip_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)", [t.id, DEV_USER.id, now]);
  }
}

if (!OIDC_CONFIGURED) await bootstrapDevUser();

let oidcConfig: oidc.Configuration | null = null;
async function getOidcConfig(): Promise<oidc.Configuration> {
  if (!OIDC_CONFIGURED) throw new Error("OIDC is not configured (OIDC_ISSUER_URL/CLIENT_ID/CLIENT_SECRET/REDIRECT_URI)");
  if (!oidcConfig) {
    oidcConfig = await oidc.discovery(new URL(ISSUER_URL!), CLIENT_ID!, CLIENT_SECRET!);
  }
  return oidcConfig;
}

async function findOrCreateUser(email: string, name: string | null): Promise<User> {
  const existing = await db.get<UserRow>("SELECT * FROM users WHERE email = ?", [email]);
  if (existing) {
    // A name can change upstream (IdP profile edit); status/role don't get
    // silently overwritten here - those only change via the admin flow
    // below or the one-time admin-bootstrap case.
    if (name && name !== existing.name) {
      await db.run("UPDATE users SET name = ? WHERE id = ?", [name, existing.id]);
      existing.name = name;
    }
    return rowToUser(existing);
  }

  const isAdmin = !!ADMIN_EMAIL && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.run("INSERT INTO users (id, email, name, status, role, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    id,
    email,
    name,
    isAdmin ? "approved" : "pending",
    isAdmin ? "admin" : "member",
    now,
  ]);

  if (isAdmin) {
    // Backfill: any trip created before this user/membership system
    // existed has no owner yet. The first time the real admin logs in,
    // adopt those orphaned trips rather than leaving them permanently
    // inaccessible.
    const orphanTrips = await db.all<{ id: string }>("SELECT id FROM trips WHERE id NOT IN (SELECT trip_id FROM trip_members)");
    for (const t of orphanTrips) {
      await db.run("INSERT INTO trip_members (trip_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)", [t.id, id, now]);
    }
  }

  return { id, email, name, status: isAdmin ? "approved" : "pending", role: isAdmin ? "admin" : "member" };
}

async function createSession(userId: string): Promise<string> {
  const id = randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  await db.run("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [
    id,
    userId,
    now.toISOString(),
    expires.toISOString(),
  ]);
  return id;
}

async function getUserBySession(sessionId: string): Promise<User | null> {
  const row = await db.get<UserRow>(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    [sessionId, new Date().toISOString()],
  );
  return row ? rowToUser(row) : null;
}

// Short-lived cookies carrying PKCE/state across the redirect to the IdP
// and back - not related to the long-lived session cookie above.
const FLOW_COOKIE = "mungchilog_oidc_flow";

export const auth = new Hono();

auth.get("/login", async (c) => {
  if (!OIDC_CONFIGURED) return c.json({ error: "OIDC is not configured on this deployment" }, 501);
  const config = await getOidcConfig();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();

  setCookie(c, FLOW_COOKIE, JSON.stringify({ codeVerifier, state }), {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "Lax",
    maxAge: 600, // 10 minutes is plenty for a login round-trip
    path: "/",
  });

  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: REDIRECT_URI!,
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });
  return c.redirect(url.toString());
});

auth.get("/callback", async (c) => {
  if (!OIDC_CONFIGURED) return c.json({ error: "OIDC is not configured on this deployment" }, 501);
  const flowRaw = getCookie(c, FLOW_COOKIE);
  deleteCookie(c, FLOW_COOKIE, { path: "/" });
  if (!flowRaw) return c.json({ error: "login session expired, try again" }, 400);

  let flow: { codeVerifier: string; state: string };
  try {
    flow = JSON.parse(flowRaw);
  } catch {
    return c.json({ error: "invalid login session" }, 400);
  }

  const config = await getOidcConfig();
  let tokens;
  try {
    tokens = await oidc.authorizationCodeGrant(config, new URL(c.req.url), {
      pkceCodeVerifier: flow.codeVerifier,
      expectedState: flow.state,
    }, { redirect_uri: REDIRECT_URI! });
  } catch (err) {
    console.error("OIDC callback failed:", err);
    return c.json({ error: "login failed" }, 400);
  }

  const claims = tokens.claims();
  const email = claims?.email as string | undefined;
  if (!email) return c.json({ error: "the identity provider did not return an email claim" }, 400);
  const name = (claims?.name as string | undefined) ?? null;

  const user = await findOrCreateUser(email, name);
  const sessionId = await createSession(user.id);
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "Lax",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });

  return c.redirect(user.status === "pending" ? "/pending" : "/trips");
});

auth.post("/logout", async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) await db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ loggedOut: true });
});

auth.get("/me", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "not logged in" }, 401);
  return c.json(user);
});

export async function findUserByEmail(email: string): Promise<User | null> {
  const row = await db.get<UserRow>("SELECT * FROM users WHERE email = ?", [email]);
  return row ? rowToUser(row) : null;
}

export async function findUserById(id: string): Promise<User | null> {
  const row = await db.get<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
  return row ? rowToUser(row) : null;
}

export async function listUsers(): Promise<User[]> {
  return (await db.all<UserRow>("SELECT * FROM users ORDER BY created_at ASC")).map(rowToUser);
}

export async function setUserStatus(id: string, status: "pending" | "approved") {
  await db.run("UPDATE users SET status = ? WHERE id = ?", [status, id]);
}

export async function getCurrentUser(c: Context): Promise<User | null> {
  if (!OIDC_CONFIGURED) return DEV_USER;
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) return null;
  return await getUserBySession(sessionId);
}

// Attaches c.var.user for every route it wraps and 401s if there's no
// valid session. Does NOT check approval status - see requireApproved,
// which most routes should stack on top of this.
export async function requireAuth(c: Context, next: Next) {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "login required" }, 401);
  c.set("user", user);
  await next();
}

// Blocks anyone still in the post-signup "pending" queue from touching
// trip data, even though they do have a valid session (see M6 in
// TASK.md: a stranger who somehow gets past the Ingress's Basic Auth
// still can't see anyone's itinerary until the admin approves them).
export async function requireApproved(c: Context, next: Next) {
  const user = c.get("user") as User | undefined;
  if (!user) return c.json({ error: "login required" }, 401);
  if (user.status !== "approved") return c.json({ error: "account pending admin approval" }, 403);
  await next();
}

export async function requireAdmin(c: Context, next: Next) {
  const user = c.get("user") as User | undefined;
  if (!user) return c.json({ error: "login required" }, 401);
  if (user.role !== "admin") return c.json({ error: "admin only" }, 403);
  await next();
}
