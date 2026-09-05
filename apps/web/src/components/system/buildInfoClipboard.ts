import type { BuildInfo } from "../../buildInfo";

export function buildInfoClipboardText(info: BuildInfo) {
  return [
    `환경: ${info.environmentLabel}`,
    ...(info.releaseVersion ? [`릴리스: ${info.releaseVersion}`] : []),
    `버전: ${info.imageTag}`,
    `커밋: ${info.commitSha}`,
    `브랜치: ${info.branch}`,
    `빌드 시각: ${info.builtAt}`,
  ].join("\n");
}
