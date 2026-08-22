import assert from "node:assert/strict";
import test from "node:test";
import { canUseLocalDevAuth, isAuthenticationReady, isOidcConfigured } from "./auth-config.js";

const OIDC_ENV = {
  OIDC_ISSUER_URL: "https://identity.example/application/o/mungchilog/",
  OIDC_CLIENT_ID: "mungchilog",
  OIDC_CLIENT_SECRET: "test-secret",
  OIDC_REDIRECT_URI: "https://mungchilog.example/auth/callback",
};

test("local fallback is available only to an explicit development process", () => {
  assert.equal(canUseLocalDevAuth({ NODE_ENV: "development" }), true);
  assert.equal(canUseLocalDevAuth({ NODE_ENV: "production" }), false);
  assert.equal(canUseLocalDevAuth({}), false);
});

test("production readiness requires all OIDC settings", () => {
  assert.equal(isOidcConfigured({ NODE_ENV: "production", ...OIDC_ENV }), true);
  assert.equal(isAuthenticationReady({ NODE_ENV: "production", ...OIDC_ENV }), true);
  assert.equal(isOidcConfigured({ NODE_ENV: "production", OIDC_CLIENT_ID: "mungchilog" }), false);
  assert.equal(isAuthenticationReady({ NODE_ENV: "production", OIDC_CLIENT_ID: "mungchilog" }), false);
});
