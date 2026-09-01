export type PublicBuildInfo = {
  environment: "dev" | "stg" | "prd" | "local";
  buildNumber: string;
  imageTag: string;
  commitSha: string;
  branch: string;
  builtAt: string;
  releaseVersion: string | undefined;
};

export function createPublicBuildInfo(environmentVariables?: NodeJS.ProcessEnv): PublicBuildInfo;
export function writePublicBuildInfo(environmentVariables?: NodeJS.ProcessEnv): Promise<void>;
