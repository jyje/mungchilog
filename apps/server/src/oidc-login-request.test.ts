import assert from "node:assert/strict";
import test from "node:test";

import { oidcLoginRequest } from "./oidc-login-request.js";

const baseRequest = {
  redirectUri: "https://mungchilog.example/auth/callback",
  codeChallenge: "challenge",
  state: "state",
  nonce: "nonce",
};

test("ordinary OIDC sign-in preserves the provider SSO session", () => {
  assert.deepEqual(oidcLoginRequest(baseRequest), {
    redirect_uri: "https://mungchilog.example/auth/callback",
    scope: "openid email profile",
    code_challenge: "challenge",
    code_challenge_method: "S256",
    state: "state",
    nonce: "nonce",
  });
});

test("fresh OIDC sign-in requests provider reauthentication", () => {
  assert.equal(oidcLoginRequest({ ...baseRequest, requireFreshAuthentication: true }).prompt, "login");
});
