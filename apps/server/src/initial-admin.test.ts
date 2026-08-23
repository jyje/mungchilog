import assert from "node:assert/strict";
import test from "node:test";

import {
  canActivateInitialAdminCandidate,
  initialAdminEmails,
  shouldSeedInitialAdminCandidates,
} from "./initial-admin.js";

test("INITIAL_ADMIN_EMAIL takes precedence over the legacy setting and accepts comma-separated addresses", () => {
  assert.deepEqual(initialAdminEmails({
    INITIAL_ADMIN_EMAIL: "first@example.com, Second@example.com, first@example.com",
    ADMIN_EMAIL: "legacy@example.com",
  }), ["first@example.com", "second@example.com"]);
});

test("the legacy administrator setting remains compatible", () => {
  assert.deepEqual(initialAdminEmails({ ADMIN_EMAIL: "legacy@example.com,second@example.com" }), ["legacy@example.com", "second@example.com"]);
});

test("seeding requires configured candidates and no approved administrator", () => {
  assert.equal(shouldSeedInitialAdminCandidates({ configuredInitialAdminEmails: ["admin@example.com"], hasApprovedAdmin: false }), true);
  assert.equal(shouldSeedInitialAdminCandidates({ configuredInitialAdminEmails: [], hasApprovedAdmin: false }), false);
  assert.equal(shouldSeedInitialAdminCandidates({ configuredInitialAdminEmails: ["admin@example.com"], hasApprovedAdmin: true }), false);
});

test("only verified, pre-seeded candidates activate as administrators", () => {
  assert.equal(canActivateInitialAdminCandidate({
    email: "Admin@Example.com",
    emailIsVerified: true,
    configuredInitialAdminEmails: ["admin@example.com", "second@example.com"],
    isPendingAdministratorCandidate: true,
  }), true);
  assert.equal(canActivateInitialAdminCandidate({
    email: "admin@example.com",
    emailIsVerified: false,
    configuredInitialAdminEmails: ["admin@example.com"],
    isPendingAdministratorCandidate: true,
  }), false);
  assert.equal(canActivateInitialAdminCandidate({
    email: "admin@example.com",
    emailIsVerified: true,
    configuredInitialAdminEmails: ["admin@example.com"],
    isPendingAdministratorCandidate: false,
  }), false);
});
