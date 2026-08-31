import { describe, expect, it } from "vitest";
import { buildInfoFromRuntimeConfig } from "../src/buildInfo";

describe("build identity", () => {
  it("uses one runtime contract for development and staging labels", () => {
    expect(buildInfoFromRuntimeConfig({
      environment: "dev", buildNumber: "54", imageTag: "r54-cb8a672", commitSha: "cb8a672",
      branch: "dev", builtAt: "2026-08-29T06:38:27Z",
    })).toMatchObject({ environmentLabel: "DEV", primaryLabel: "DEV · Build 54" });

    expect(buildInfoFromRuntimeConfig({ environment: "stg", buildNumber: "46" }))
      .toMatchObject({ environmentLabel: "STG", primaryLabel: "STG · Build 46" });
  });

  it("uses a semantic version as the production label", () => {
    expect(buildInfoFromRuntimeConfig({ environment: "prd", releaseVersion: "v1.2.3" }))
      .toMatchObject({ environmentLabel: "PRD", primaryLabel: "v1.2.3", releaseVersion: "v1.2.3" });
  });

  it("never falls back to a development label for malformed production metadata", () => {
    expect(buildInfoFromRuntimeConfig({ environment: "prd", releaseVersion: "1.2.3" }))
      .toMatchObject({ environmentLabel: "PRD", primaryLabel: "PRD", releaseVersion: null });
  });

  it("falls back cleanly for an unconfigured local build", () => {
    expect(buildInfoFromRuntimeConfig({})).toMatchObject({
      environment: "local", environmentLabel: "Local", primaryLabel: "Local", imageTag: "Unbuilt", branch: "local",
    });
  });
});
