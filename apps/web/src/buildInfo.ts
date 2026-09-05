export type BuildEnvironment = "dev" | "stg" | "prd" | "local";

export type BuildInfo = {
  environment: BuildEnvironment;
  environmentLabel: string;
  primaryLabel: string;
  buildNumber: string;
  imageTag: string;
  commitSha: string;
  branch: string;
  builtAt: string;
  releaseVersion: string | null;
};

export type PublicBuildConfig = Partial<{
  environment: string;
  buildNumber: string;
  imageTag: string;
  commitSha: string;
  branch: string;
  builtAt: string;
  releaseVersion: string;
}>;

declare global {
  interface Window {
    __MUNGCHILOG_BUILD_INFO__?: PublicBuildConfig;
  }
}

const ENVIRONMENT_LABELS: Record<BuildEnvironment, string> = {
  dev: "DEV",
  stg: "STG",
  prd: "PRD",
  local: "Local",
};

const SEMANTIC_VERSION = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function environmentFrom(value: unknown): BuildEnvironment {
  const environment = text(value, "local").toLowerCase();
  return environment === "dev" || environment === "stg" || environment === "prd" ? environment : "local";
}

// This is the sole environment-specific presentation rule. The app shell and
// BuildIdentity component always render the same BuildInfo contract.
export function buildInfoFromRuntimeConfig(config: PublicBuildConfig = {}): BuildInfo {
  const environment = environmentFrom(config.environment);
  const candidateReleaseVersion = text(config.releaseVersion, "");
  const releaseVersion = SEMANTIC_VERSION.test(candidateReleaseVersion) ? candidateReleaseVersion : null;
  const environmentLabel = ENVIRONMENT_LABELS[environment];
  const buildNumber = text(config.buildNumber, "Unbuilt");
  const primaryLabel = environment === "prd"
    ? releaseVersion ?? "PRD"
    : environment === "local"
      ? environmentLabel
      : `${environmentLabel} · Build ${buildNumber}`;

  return {
    environment,
    environmentLabel,
    primaryLabel,
    buildNumber,
    imageTag: text(config.imageTag, "Unbuilt"),
    commitSha: text(config.commitSha, "Unavailable"),
    branch: text(config.branch, environment),
    builtAt: text(config.builtAt, "Unavailable"),
    releaseVersion,
  };
}

export const BUILD_INFO = buildInfoFromRuntimeConfig(
  typeof window === "undefined" ? {} : window.__MUNGCHILOG_BUILD_INFO__,
);
