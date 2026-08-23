import { randomBytes, randomUUID } from "node:crypto";
import * as oidc from "openid-client";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db } from "./db.js";
import { canUseLocalDevAuth, isAuthenticationReady as getAuthenticationReadiness, isOidcConfigured } from "./auth-config.js";
import { oidcCallbackUrl, oidcClientAuthentication } from "./oidc-client-auth.js";
import { oidcIdentityFromClaims, type OidcIdentity } from "./oidc-identity.js";
import { oidcLoginRequest } from "./oidc-login-request.js";
import {
  canActivateInitialAdminCandidate,
  initialAdminEmails,
  shouldSeedInitialAdminCandidates,
} from "./initial-admin.js";
import { canAllowUnverifiedEmailForLocalOidc, canAuthenticateWithUnverifiedEmailClaim } from "./local-oidc-email-verification.js";
import { sessionStorageId } from "./session-security.js";

// Standard OIDC login, configured entirely via env vars so this works with
// any compliant provider (Authentik, Keycloak, Google Workspace, ...) -
// nothing here is Authentik-specific. See docs/authentik-setup.md for how
// jyje's own instance is wired up, and .env.sample for what to set.
const ISSUER_URL = process.env.OIDC_ISSUER_URL;
const CLIENT_ID = process.env.OIDC_CLIENT_ID;
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
const REDIRECT_URI = process.env.OIDC_REDIRECT_URI;
// This comma-separated value must come from a deployment Secret. It seeds
// pending administrator candidates before the first sign-in. A candidate is
// activated only when a verified OIDC identity claims its configured address.
const INITIAL_ADMIN_EMAILS = initialAdminEmails();

const OIDC_CONFIGURED = isOidcConfigured();
const ALLOW_UNVERIFIED_EMAIL_FOR_LOCAL_OIDC = canAllowUnverifiedEmailForLocalOidc();
// A missing production Secret or ConfigMap must never turn into an
// authenticated local administrator. The fallback is limited to an explicit
// development process so a misconfigured deployment fails closed.
const LOCAL_DEV_AUTH = canUseLocalDevAuth();
const SESSION_COOKIE = "mungchilog_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SECURE_COOKIES = process.env.NODE_ENV === "production";

// Kubernetes uses this through /readyz before admitting production traffic.
// A locally started development server remains usable without an identity
// provider, but every other environment requires complete OIDC settings.
export function isAuthenticationReady() {
  return getAuthenticationReadiness();
}

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

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  oidc_issuer: string | null;
  oidc_subject: string | null;
  status: string;
  role: string;
};

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
const DEV_USER: User = { id: "dev-local", email: "dev@localhost", name: "Local Dev", status: "approved", role: "admin" };

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

if (LOCAL_DEV_AUTH) await bootstrapDevUser();

function isPendingAdministratorCandidate(row: UserRow, email: string): boolean {
  return row.status === "pending" && row.role === "admin" && row.email === email;
}

async function adoptOrphanTrips(userId: string, now: string) {
  // Keep the legacy migration behavior: the first real administrator to
  // activate owns trips created before memberships existed.
  const orphanTrips = await db.all<{ id: string }>("SELECT id FROM trips WHERE id NOT IN (SELECT trip_id FROM trip_members)");
  for (const trip of orphanTrips) {
    await db.run("INSERT INTO trip_members (trip_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)", [trip.id, userId, now]);
  }
}

async function seedInitialAdministratorCandidates() {
  const existingApprovedAdmin = await db.get<Pick<UserRow, "id">>("SELECT id FROM users WHERE role = 'admin' AND status = 'approved' LIMIT 1");
  if (!shouldSeedInitialAdminCandidates({
    configuredInitialAdminEmails: INITIAL_ADMIN_EMAILS,
    hasApprovedAdmin: !!existingApprovedAdmin,
  })) return;

  const now = new Date().toISOString();
  for (const email of INITIAL_ADMIN_EMAILS) {
    // A list member is deliberately a pending account until the exact address
    // has been returned by a verified OIDC login. This leaves no usable
    // administrator session behind merely because a Secret was mounted.
    await db.run(
      `INSERT INTO users (id, email, name, status, role, created_at) VALUES (?, ?, NULL, 'pending', 'admin', ?)
       ON CONFLICT(email) DO UPDATE SET status = 'pending', role = 'admin'`,
      [randomUUID(), email, now],
    );
  }
}

if (OIDC_CONFIGURED) await seedInitialAdministratorCandidates();

let oidcConfig: oidc.Configuration | null = null;
async function getOidcConfig(): Promise<oidc.Configuration> {
  if (!OIDC_CONFIGURED) throw new Error("OIDC is not configured (OIDC_ISSUER_URL/CLIENT_ID/CLIENT_SECRET/REDIRECT_URI)");
  if (!oidcConfig) {
    oidcConfig = await oidc.discovery(
      new URL(ISSUER_URL!),
      CLIENT_ID!,
      undefined,
      oidcClientAuthentication(CLIENT_SECRET!),
    );
  }
  return oidcConfig;
}

async function findUserByIdentity(identity: OidcIdentity): Promise<UserRow | undefined> {
  return db.get<UserRow>("SELECT * FROM users WHERE oidc_issuer = ? AND oidc_subject = ?", [identity.issuer, identity.subject]);
}

async function findOrCreateUser(
  identity: OidcIdentity,
  email: string,
  name: string | null,
  emailIsVerified: boolean,
): Promise<User> {
  const identityMatch = await findUserByIdentity(identity);
  if (identityMatch) {
    const activateInitialAdmin = canActivateInitialAdminCandidate({
      email,
      emailIsVerified,
      configuredInitialAdminEmails: INITIAL_ADMIN_EMAILS,
      isPendingAdministratorCandidate: isPendingAdministratorCandidate(identityMatch, email),
    });
    if (emailIsVerified && email !== identityMatch.email) {
      const emailOwner = await db.get<Pick<UserRow, "id">>("SELECT id FROM users WHERE LOWER(email) = ?", [email]);
      if (emailOwner && emailOwner.id !== identityMatch.id) {
        throw new Error("email is already associated with another account");
      }
    }
    if ((emailIsVerified && email !== identityMatch.email) || (name && name !== identityMatch.name) || activateInitialAdmin) {
      await db.run("UPDATE users SET email = ?, name = ?, status = ?, role = ? WHERE id = ?", [
        emailIsVerified ? email : identityMatch.email,
        name,
        activateInitialAdmin ? "approved" : identityMatch.status,
        activateInitialAdmin ? "admin" : identityMatch.role,
        identityMatch.id,
      ]);
      if (emailIsVerified) identityMatch.email = email;
      identityMatch.name = name;
      if (activateInitialAdmin) {
        identityMatch.status = "approved";
        identityMatch.role = "admin";
        await adoptOrphanTrips(identityMatch.id, new Date().toISOString());
      }
    }
    return rowToUser(identityMatch);
  }

  const emailMatch = await db.get<UserRow>("SELECT * FROM users WHERE LOWER(email) = ?", [email]);
  if (emailMatch) {
    if (!emailIsVerified) {
      throw new Error("an unverified email cannot claim an existing account");
    }
    if (emailMatch.oidc_issuer || emailMatch.oidc_subject) {
      throw new Error("email is already associated with a different identity provider account");
    }
    const activateInitialAdmin = canActivateInitialAdminCandidate({
      email,
      emailIsVerified,
      configuredInitialAdminEmails: INITIAL_ADMIN_EMAILS,
      isPendingAdministratorCandidate: isPendingAdministratorCandidate(emailMatch, email),
    });
    // Existing email-only users bind their stable OIDC identity on the next
    // verified login, preserving their memberships without trusting email
    // as the account key from then on.
    await db.run("UPDATE users SET oidc_issuer = ?, oidc_subject = ?, name = ?, status = ?, role = ? WHERE id = ?", [
      identity.issuer,
      identity.subject,
      name,
      activateInitialAdmin ? "approved" : emailMatch.status,
      activateInitialAdmin ? "admin" : emailMatch.role,
      emailMatch.id,
    ]);
    emailMatch.oidc_issuer = identity.issuer;
    emailMatch.oidc_subject = identity.subject;
    emailMatch.name = name;
    if (activateInitialAdmin) {
      emailMatch.status = "approved";
      emailMatch.role = "admin";
      await adoptOrphanTrips(emailMatch.id, new Date().toISOString());
    }
    return rowToUser(emailMatch);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  await db.run("INSERT INTO users (id, email, name, oidc_issuer, oidc_subject, status, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
    id,
    email,
    name,
    identity.issuer,
    identity.subject,
    "pending",
    "member",
    now,
  ]);

  return { id, email, name, status: "pending", role: "member" };
}

async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  await db.run("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [
    sessionStorageId(token),
    userId,
    now.toISOString(),
    expires.toISOString(),
  ]);
  return token;
}

async function deleteSession(token: string) {
  // The raw token branch keeps logout and session rotation compatible with
  // sessions created before database-side hashing was introduced.
  await db.run("DELETE FROM sessions WHERE id IN (?, ?)", [sessionStorageId(token), token]);
}

async function getUserBySession(token: string): Promise<User | null> {
  type SessionUserRow = UserRow & { session_id: string };
  const storedId = sessionStorageId(token);
  let row = await db.get<SessionUserRow>(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    [storedId, new Date().toISOString()],
  );
  if (!row) {
    row = await db.get<SessionUserRow>(
      `SELECT u.*, s.id AS session_id FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
      [token, new Date().toISOString()],
    );
    if (row) await db.run("UPDATE sessions SET id = ? WHERE id = ?", [storedId, token]);
  }
  return row ? rowToUser(row) : null;
}

// Short-lived cookies carrying PKCE/state across the redirect to the IdP
// and back - not related to the long-lived session cookie above.
const FLOW_COOKIE = "mungchilog_oidc_flow";

export const auth = new Hono();

async function beginOidcLogin(c: Context, requireFreshAuthentication = false): Promise<URL | Response> {
  if (!OIDC_CONFIGURED) return c.json({ error: "OIDC is not configured on this deployment" }, 503);
  const config = await getOidcConfig();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  setCookie(c, FLOW_COOKIE, JSON.stringify({ codeVerifier, state, nonce }), {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "Lax",
    maxAge: 600, // 10 minutes is plenty for a login round-trip
    path: "/",
  });

  return oidc.buildAuthorizationUrl(config, oidcLoginRequest({
    redirectUri: REDIRECT_URI!,
    codeChallenge,
    state,
    nonce,
    requireFreshAuthentication,
  }));
}

auth.get("/login", async (c) => {
  const url = await beginOidcLogin(c);
  if (url instanceof Response) return url;
  return c.redirect(url.toString());
});

// This is intentionally a same-origin POST. It removes only Mungchilog's
// application session, then sends the browser through the identity provider's
// logout flow. The web client starts a fresh PKCE flow only after the logout
// document has loaded in its hidden frame.
auth.post("/restart-login", requireSameOrigin, async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) await deleteSession(sessionId);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  deleteCookie(c, FLOW_COOKIE, { path: "/" });

  if (!OIDC_CONFIGURED) return c.json({ error: "OIDC is not configured on this deployment" }, 503);
  const config = await getOidcConfig();
  const logoutUrl = oidc.buildEndSessionUrl(config);
  return c.json({ logoutUrl: logoutUrl.toString() });
});

// The browser reaches this same-origin route only after the hidden provider
// logout frame has finished. Starting the PKCE flow here prevents a Google
// source from inheriting the previous IdP user.
auth.get("/logout-complete", async (c) => {
  const url = await beginOidcLogin(c, true);
  if (url instanceof Response) return url;
  return c.redirect(url.toString());
});

auth.get("/callback", async (c) => {
  if (!OIDC_CONFIGURED) return c.json({ error: "OIDC is not configured on this deployment" }, 503);
  const flowRaw = getCookie(c, FLOW_COOKIE);
  deleteCookie(c, FLOW_COOKIE, { path: "/" });
  if (!flowRaw) return c.json({ error: "login session expired, try again" }, 400);

  let flow: { codeVerifier: string; state: string; nonce: string };
  try {
    flow = JSON.parse(flowRaw);
  } catch {
    return c.json({ error: "invalid login session" }, 400);
  }

  const config = await getOidcConfig();
  const callbackUrl = oidcCallbackUrl(REDIRECT_URI!, c.req.url);
  let tokens;
  try {
    tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: flow.codeVerifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
    });
  } catch (err) {
    console.error("OIDC callback failed:", err);
    return c.json({ error: "login failed" }, 400);
  }

  const claims = tokens.claims();
  const email = (claims?.email as string | undefined)?.trim().toLowerCase();
  const emailVerified = claims?.email_verified;
  if (!email) return c.json({ error: "the identity provider did not return an email claim" }, 400);
  const name = (claims?.name as string | undefined) ?? null;
  const identity = oidcIdentityFromClaims(claims as Record<string, unknown> | undefined);
  if (!identity) return c.json({ error: "the identity provider did not return a stable account identity" }, 400);
  const knownIdentity = await findUserByIdentity(identity);
  const existingEmailAccount = await db.get<Pick<UserRow, "id">>("SELECT id FROM users WHERE LOWER(email) = ?", [email]);
  const emailIsVerified = emailVerified === true || ALLOW_UNVERIFIED_EMAIL_FOR_LOCAL_OIDC;
  if (!emailIsVerified && !canAuthenticateWithUnverifiedEmailClaim({
    isLocalDevelopmentCallback: ALLOW_UNVERIFIED_EMAIL_FOR_LOCAL_OIDC,
    hasKnownIdentity: !!knownIdentity,
    hasExistingEmailAccount: !!existingEmailAccount,
    isConfiguredAdminEmail: INITIAL_ADMIN_EMAILS.includes(email),
  })) {
    return c.json({ error: "the identity provider did not verify the email claim" }, 400);
  }

  let user: User;
  try {
    user = await findOrCreateUser(identity, email, name, emailIsVerified);
  } catch (error) {
    console.error("OIDC user binding failed:", error);
    return c.json({ error: "login failed" }, 400);
  }
  // Rotate any session that was already present before this login so a
  // pre-login cookie cannot remain valid after authentication.
  const priorSessionId = getCookie(c, SESSION_COOKIE);
  if (priorSessionId) await deleteSession(priorSessionId);
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

auth.post("/logout", requireSameOrigin, async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) await deleteSession(sessionId);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ loggedOut: true });
});

auth.get("/me", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "not logged in" }, 401);
  return c.json(user);
});

export async function findUserByEmail(email: string): Promise<User | null> {
  const row = await db.get<UserRow>("SELECT * FROM users WHERE LOWER(email) = ?", [email.trim().toLowerCase()]);
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
  if (LOCAL_DEV_AUTH) return DEV_USER;
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
// trip data, even though they have a valid identity-provider session.
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

// SameSite=Lax cookies can still be sent by a same-site subdomain. Protect
// every state-changing production request with the configured public origin.
export async function requireSameOrigin(c: Context, next: Next) {
  if (LOCAL_DEV_AUTH || !["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
    await next();
    return;
  }
  let expectedOrigin: string | null = null;
  try {
    expectedOrigin = REDIRECT_URI ? new URL(REDIRECT_URI).origin : null;
  } catch {
    expectedOrigin = null;
  }
  if (!expectedOrigin || c.req.header("origin") !== expectedOrigin) {
    return c.json({ error: "same-origin request required" }, 403);
  }
  await next();
}
