import assert from "node:assert/strict";
import test from "node:test";
import { oidcIdentityFromClaims } from "./oidc-identity.js";

test("OIDC identity requires both issuer and subject claims", () => {
  assert.deepEqual(
    oidcIdentityFromClaims({ iss: "https://identity.example/application/o/mungchilog/", sub: "user-123" }),
    { issuer: "https://identity.example/application/o/mungchilog/", subject: "user-123" },
  );
  assert.equal(oidcIdentityFromClaims({ iss: "https://identity.example/" }), null);
  assert.equal(oidcIdentityFromClaims({ sub: "user-123" }), null);
  assert.equal(oidcIdentityFromClaims(undefined), null);
});
