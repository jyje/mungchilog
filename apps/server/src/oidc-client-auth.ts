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
