import assert from "node:assert/strict";
import test from "node:test";
import * as oidc from "openid-client";

import { oidcCallbackUrl, oidcClientAuthentication } from "./oidc-client-auth.js";

test("confidential OIDC clients authenticate at the token endpoint with HTTP Basic", async () => {
  let authorizationHeader: string | null = null;
  let requestBody = "";
  const config = new oidc.Configuration({
    issuer: "https://issuer.example",
    authorization_endpoint: "https://issuer.example/authorize",
    token_endpoint: "https://issuer.example/token",
  }, "mungchilog", undefined, oidcClientAuthentication("testsecret"));

  config[oidc.customFetch] = async (_url, init) => {
    authorizationHeader = new Headers(init?.headers).get("authorization");
    requestBody = String(init?.body);
    return new Response(JSON.stringify({ error: "invalid_grant" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  };

  await assert.rejects(() => oidc.authorizationCodeGrant(
    config,
    new URL("https://app.example/callback?code=test-code&state=test-state"),
    { expectedState: "test-state" },
    { redirect_uri: "https://app.example/callback" },
  ));

  assert.equal(authorizationHeader, `Basic ${Buffer.from("mungchilog:testsecret").toString("base64")}`);
  assert.doesNotMatch(requestBody, /client_secret/);
});

test("OIDC token exchange keeps the configured HTTPS callback URI behind an ingress", () => {
  const callbackUrl = oidcCallbackUrl(
    "https://mungchilog.example/auth/callback",
    "http://mungchilog.example/auth/callback?code=provider-code&state=provider-state",
  );

  assert.equal(
    callbackUrl.toString(),
    "https://mungchilog.example/auth/callback?code=provider-code&state=provider-state",
  );
});
