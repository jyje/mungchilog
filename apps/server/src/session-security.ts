import { createHash } from "node:crypto";

/**
 * The browser receives the opaque session token. The database stores only
 * this one-way digest, so a database read alone cannot be replayed as a
 * browser session.
 */
export function sessionStorageId(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
