import { describe, expect, it } from "vitest";
import { buildInfoFromEnv } from "../src/buildInfo";

describe("build identity", () => {
  it("uses a concise environment label and preserves support details", () => {
    expect(buildInfoFromEnv({
      VITE_BUILD_ENV: "dev",
      VITE_BUILD_NUMBER: "54",
      VITE_IMAGE_TAG: "r54-cb8a672",
      VITE_COMMIT_SHA: "cb8a672",
      VITE_BUILD_BRANCH: "dev",
      VITE_BUILD_TIME: "2026-08-29T06:38:27Z",
    })).toEqual({
      environment: "dev",
      environmentLabel: "DEV",
      buildNumber: "54",
      imageTag: "r54-cb8a672",
      commitSha: "cb8a672",
      branch: "dev",
      builtAt: "2026-08-29T06:38:27Z",
    });
  });

  it("falls back cleanly for local builds without CI variables", () => {
    expect(buildInfoFromEnv({})).toMatchObject({ environmentLabel: "Local", buildNumber: "Unbuilt", imageTag: "Unbuilt", branch: "local" });
  });

  it("normalizes staging and production environment labels", () => {
    expect(buildInfoFromEnv({ VITE_BUILD_ENV: "stg" }).environmentLabel).toBe("STG");
    expect(buildInfoFromEnv({ VITE_BUILD_ENV: "prd" }).environmentLabel).toBe("Production");
  });
});
