import assert from "node:assert/strict";
import test from "node:test";
import { sessionStorageId } from "./session-security.js";

test("session storage IDs are deterministic one-way digests", () => {
  const token = "a6f2d5a98de44f0cb1c5f7d77c9d65b2";
  const stored = sessionStorageId(token);

  assert.equal(stored, sessionStorageId(token));
  assert.notEqual(stored, token);
  assert.match(stored, /^[a-f0-9]{64}$/);
});
