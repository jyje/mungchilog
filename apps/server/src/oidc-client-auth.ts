import * as oidc from "openid-client";

/**
 * Authenticate confidential OIDC clients at the token endpoint with HTTP Basic.
 *
 * This is the interoperable method used by the production Authentik provider.
 * Keeping it explicit avoids silently changing authentication method when the
 * OIDC client library changes its default.
 */
export function oidcClientAuthentication(clientSecret: string): oidc.ClientAuth {
  return oidc.ClientSecretBasic(clientSecret);
}

/**
 * Rebuild the OIDC callback URL from the registered redirect URI.
 *
 * An ingress commonly forwards the callback to the application over HTTP. The
 * authorization code exchange must still use the registered public HTTPS URI,
 * while preserving the provider's query parameters from the incoming request.
 */
export function oidcCallbackUrl(redirectUri: string, incomingCallbackUrl: string | URL): URL {
  const configuredCallbackUrl = new URL(redirectUri);
  const incomingUrl = new URL(incomingCallbackUrl);
  configuredCallbackUrl.search = incomingUrl.search;
  return configuredCallbackUrl;
}
