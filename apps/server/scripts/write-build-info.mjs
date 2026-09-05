import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const environments = new Set(["dev", "stg", "prd", "local"]);
const semanticVersion = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

function value(environment, name, fallback = "") {
  const candidate = environment[name];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : fallback;
}

export function createPublicBuildInfo(environmentVariables = process.env) {
  const environment = value(environmentVariables, "BUILD_ENV", "local").toLowerCase();
  if (!environments.has(environment)) {
    throw new Error(`BUILD_ENV must be one of ${[...environments].join(", ")}`);
  }

  const releaseVersion = value(environmentVariables, "RELEASE_VERSION");
  if (environment === "prd" && !semanticVersion.test(releaseVersion)) {
    throw new Error("Production images require RELEASE_VERSION in vMAJOR.MINOR.PATCH form");
  }

  if (environment !== "prd" && releaseVersion) {
    throw new Error("RELEASE_VERSION is only valid for production images");
  }

  return {
    environment,
    buildNumber: value(environmentVariables, "BUILD_NUMBER"),
    imageTag: value(environmentVariables, "IMAGE_TAG"),
    commitSha: value(environmentVariables, "COMMIT_SHA"),
    branch: value(environmentVariables, "BUILD_BRANCH", environment),
    builtAt: value(environmentVariables, "BUILD_TIME"),
    releaseVersion: releaseVersion || undefined,
  };
}

export async function writePublicBuildInfo(environmentVariables = process.env) {
  const output = resolve(value(environmentVariables, "BUILD_INFO_OUTPUT", "/app/public/build-info.js"));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    `globalThis.__MUNGCHILOG_BUILD_INFO__ = Object.freeze(${JSON.stringify(createPublicBuildInfo(environmentVariables))});\n`,
    "utf8",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writePublicBuildInfo();
}
