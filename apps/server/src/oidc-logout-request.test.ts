import assert from "node:assert/strict";
import test from "node:test";

import { oidcPostLogoutRedirectUri } from "./oidc-logout-request.js";

test("OIDC logout returns to a clean local completion route", () => {
  assert.equal(
    oidcPostLogoutRedirectUri("http://localhost:3000/auth/callback"),
    "http://localhost:3000/auth/logout-complete",
  );
});

test("OIDC logout preserves the configured public application origin", () => {
  assert.equal(
    oidcPostLogoutRedirectUri("https://mungchilog.example/auth/callback?unexpected=value"),
    "https://mungchilog.example/auth/logout-complete",
  );
});
