import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { BUILD_INFO, type BuildInfo } from "../../buildInfo";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { buildInfoClipboardText } from "./buildInfoClipboard";
import "./build-identity.css";

export function BuildIdentity({ info = BUILD_INFO }: { info?: BuildInfo }) {
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function copyBuildInfo() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(buildInfoClipboardText(info));
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState("idle"), 2_000);
  }

  const copyLabel = copyState === "success"
    ? "복사됨"
    : copyState === "error"
      ? "복사하지 못했습니다"
      : "빌드 정보 복사";

  return (
    <footer className="build-identity" aria-label="빌드 정보">
      <details>
        <summary>{info.primaryLabel}</summary>
        <div className="build-identity-popover">
          <div className="build-identity-popover-header">
            <span>빌드 정보</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={copyLabel}
                  onClick={copyBuildInfo}
                >
                  <Copy aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" sideOffset={8} collisionPadding={12}>{copyLabel}</TooltipContent>
            </Tooltip>
          </div>
          <dl>
            <div><dt>환경</dt><dd>{info.environmentLabel}</dd></div>
            {info.releaseVersion && <div><dt>릴리스</dt><dd>{info.releaseVersion}</dd></div>}
            <div><dt>브랜치</dt><dd>{info.branch}</dd></div>
            <div><dt>이미지</dt><dd>{info.imageTag}</dd></div>
            <div><dt>커밋</dt><dd>{info.commitSha}</dd></div>
            <div><dt>빌드 시각</dt><dd>{info.builtAt}</dd></div>
          </dl>
          <span className="sr-only" role="status" aria-live="polite">{copyState === "idle" ? "" : copyLabel}</span>
        </div>
      </details>
    </footer>
  );
}
