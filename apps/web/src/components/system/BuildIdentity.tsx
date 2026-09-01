import { BUILD_INFO, type BuildInfo } from "../../buildInfo";
import "./build-identity.css";

export function BuildIdentity({ info = BUILD_INFO }: { info?: BuildInfo }) {
  return (
    <footer className="build-identity" aria-label="빌드 정보">
      <details>
        <summary>{info.primaryLabel}</summary>
        <dl>
          <div><dt>환경</dt><dd>{info.environmentLabel}</dd></div>
          {info.releaseVersion && <div><dt>릴리스</dt><dd>{info.releaseVersion}</dd></div>}
          <div><dt>브랜치</dt><dd>{info.branch}</dd></div>
          <div><dt>이미지</dt><dd>{info.imageTag}</dd></div>
          <div><dt>커밋</dt><dd>{info.commitSha}</dd></div>
          <div><dt>빌드 시각</dt><dd>{info.builtAt}</dd></div>
        </dl>
      </details>
    </footer>
  );
}
