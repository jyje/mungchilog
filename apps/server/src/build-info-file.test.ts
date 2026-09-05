import assert from "node:assert/strict";
import test from "node:test";
import { createPublicBuildInfo } from "../scripts/write-build-info.mjs";

test("public build identity accepts dev and production contracts", () => {
  assert.deepEqual(createPublicBuildInfo({
    BUILD_ENV: "dev",
    BUILD_NUMBER: "81",
    IMAGE_TAG: "r81-fa14a88",
    COMMIT_SHA: "fa14a88",
    BUILD_BRANCH: "dev",
    BUILD_TIME: "2026-08-30T13:38:20Z",
  }), {
    environment: "dev",
    buildNumber: "81",
    imageTag: "r81-fa14a88",
    commitSha: "fa14a88",
    branch: "dev",
    builtAt: "2026-08-30T13:38:20Z",
    releaseVersion: undefined,
  });

  assert.equal(createPublicBuildInfo({
    BUILD_ENV: "prd",
    RELEASE_VERSION: "v1.2.3",
  }).releaseVersion, "v1.2.3");
});

test("public build identity rejects missing or misplaced release versions", () => {
  assert.throws(
    () => createPublicBuildInfo({ BUILD_ENV: "prd" }),
    /Production images require RELEASE_VERSION/,
  );
  assert.throws(
    () => createPublicBuildInfo({ BUILD_ENV: "stg", RELEASE_VERSION: "v1.2.3" }),
    /RELEASE_VERSION is only valid/,
  );
});
