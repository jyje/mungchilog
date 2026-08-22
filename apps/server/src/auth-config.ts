const OIDC_SETTINGS = ["OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI"] as const;

export function isOidcConfigured(env: NodeJS.ProcessEnv = process.env) {
  return OIDC_SETTINGS.every((setting) => Boolean(env[setting]));
}

export function canUseLocalDevAuth(env: NodeJS.ProcessEnv = process.env) {
  return !isOidcConfigured(env) && env.NODE_ENV === "development";
}

export function isAuthenticationReady(env: NodeJS.ProcessEnv = process.env) {
  return isOidcConfigured(env) || canUseLocalDevAuth(env);
}
