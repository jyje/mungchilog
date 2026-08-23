export type OidcIdentity = {
  issuer: string;
  subject: string;
};

/**
 * `iss` and `sub` are the immutable OIDC account key. Email is useful for
 * contact and invitations, but it is not safe as the long-term identity key.
 */
export function oidcIdentityFromClaims(claims: Record<string, unknown> | undefined): OidcIdentity | null {
  const issuer = claims?.iss;
  const subject = claims?.sub;
  if (typeof issuer !== "string" || !issuer || typeof subject !== "string" || !subject) return null;
  return { issuer, subject };
}
