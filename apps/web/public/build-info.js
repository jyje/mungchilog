// Docker replaces this file in the final image layer. Keep the development
// fallback public, deterministic, and independent from Vite build variables.
globalThis.__MUNGCHILOG_BUILD_INFO__ = {
  environment: "local",
  buildNumber: "",
  imageTag: "",
  commitSha: "",
  branch: "local",
  builtAt: "",
  releaseVersion: "",
};
