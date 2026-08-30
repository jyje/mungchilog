export type BuildInfo = {
  environment: string;
  environmentLabel: string;
  buildNumber: string;
  imageTag: string;
  commitSha: string;
  branch: string;
  builtAt: string;
};

type BuildEnv = Record<string, unknown>;

const ENVIRONMENT_LABELS: Record<string, string> = {
  development: "DEV",
  dev: "DEV",
  staging: "STG",
  stg: "STG",
  production: "Production",
  prod: "Production",
  prd: "Production",
  local: "Local",
};

export function buildInfoFromEnv(env: BuildEnv): BuildInfo {
  const environment = String(env.VITE_BUILD_ENV ?? "local").trim().toLowerCase() || "local";
  const buildNumber = String(env.VITE_BUILD_NUMBER ?? "").trim() || "Unbuilt";
  const imageTag = String(env.VITE_IMAGE_TAG ?? "").trim() || "Unbuilt";
  const commitSha = String(env.VITE_COMMIT_SHA ?? "").trim() || "Unavailable";
  const branch = String(env.VITE_BUILD_BRANCH ?? "").trim() || "local";
  const builtAt = String(env.VITE_BUILD_TIME ?? "").trim() || "Unavailable";

  return {
    environment,
    environmentLabel: ENVIRONMENT_LABELS[environment] ?? environment,
    buildNumber,
    imageTag,
    commitSha,
    branch,
    builtAt,
  };
}

export const BUILD_INFO = buildInfoFromEnv({
  VITE_BUILD_ENV: import.meta.env.VITE_BUILD_ENV,
  VITE_BUILD_NUMBER: import.meta.env.VITE_BUILD_NUMBER,
  VITE_IMAGE_TAG: import.meta.env.VITE_IMAGE_TAG,
  VITE_COMMIT_SHA: import.meta.env.VITE_COMMIT_SHA,
  VITE_BUILD_BRANCH: import.meta.env.VITE_BUILD_BRANCH,
  VITE_BUILD_TIME: import.meta.env.VITE_BUILD_TIME,
});
