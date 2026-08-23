export type OidcLoginRequest = {
  redirectUri: string;
  codeChallenge: string;
  state: string;
  nonce: string;
  requireFreshAuthentication?: boolean;
};

// Keep the ordinary sign-in path capable of using the provider's existing
// SSO session. A user-initiated account change is the only flow that asks the
// provider to show its sign-in screen again.
export function oidcLoginRequest({
  redirectUri,
  codeChallenge,
  state,
  nonce,
  requireFreshAuthentication = false,
}: OidcLoginRequest): Record<string, string> {
  return {
    redirect_uri: redirectUri,
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
    ...(requireFreshAuthentication ? { prompt: "login" } : {}),
  };
}
