type Environment = NodeJS.ProcessEnv;

/**
 * Authentik's local-password accounts do not carry a verified-email claim.
 * Permit them only for an explicit loopback development callback so production
 * invitation and identity binding rules always require a verified address.
 */
export function canAllowUnverifiedEmailForLocalOidc(env: Environment = process.env): boolean {
  if (env.NODE_ENV !== "development" || !env.OIDC_REDIRECT_URI) return false;

  try {
    const callback = new URL(env.OIDC_REDIRECT_URI);
    return callback.protocol === "http:"
      && callback.hostname === "localhost"
      && callback.pathname === "/auth/callback";
  } catch {
    return false;
  }
}
