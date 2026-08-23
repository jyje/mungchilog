import assert from "node:assert/strict";
import test from "node:test";
import { canAllowUnverifiedEmailForLocalOidc, canAuthenticateWithUnverifiedEmailClaim } from "./local-oidc-email-verification.js";

test("unverified email claims are allowed only for the explicit local development callback", () => {
  assert.equal(canAllowUnverifiedEmailForLocalOidc({
    NODE_ENV: "development",
    OIDC_REDIRECT_URI: "http://localhost:3000/auth/callback",
  }), true);
  assert.equal(canAllowUnverifiedEmailForLocalOidc({
    NODE_ENV: "production",
    OIDC_REDIRECT_URI: "http://localhost:3000/auth/callback",
  }), false);
  assert.equal(canAllowUnverifiedEmailForLocalOidc({
    NODE_ENV: "development",
    OIDC_REDIRECT_URI: "https://mungchilog.app.jyje.online/auth/callback",
  }), false);
  assert.equal(canAllowUnverifiedEmailForLocalOidc({ NODE_ENV: "development" }), false);
});

test("an unverified email claim can only reuse an already-bound identity outside local development", () => {
  assert.equal(canAuthenticateWithUnverifiedEmailClaim({ isLocalDevelopmentCallback: false, hasKnownIdentity: true }), true);
  assert.equal(canAuthenticateWithUnverifiedEmailClaim({ isLocalDevelopmentCallback: true, hasKnownIdentity: false }), true);
  assert.equal(canAuthenticateWithUnverifiedEmailClaim({ isLocalDevelopmentCallback: false, hasKnownIdentity: false }), false);
});
