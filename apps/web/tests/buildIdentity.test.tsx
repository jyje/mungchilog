import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BuildIdentity } from "../src/components/system/BuildIdentity";
import { buildInfoClipboardText } from "../src/components/system/buildInfoClipboard";
import type { BuildInfo } from "../src/buildInfo";
import { TooltipProvider } from "../src/components/ui/tooltip";

const info: BuildInfo = {
  environment: "dev",
  environmentLabel: "DEV",
  primaryLabel: "DEV · Build 54",
  buildNumber: "54",
  imageTag: "r54-cb8a672",
  commitSha: "cb8a672",
  branch: "dev",
  builtAt: "2026-08-29T06:38:27Z",
  releaseVersion: null,
};

const writeText = vi.fn();

function renderBuildIdentity(buildInfo = info) {
  return render(<TooltipProvider delayDuration={0}><BuildIdentity info={buildInfo} /></TooltipProvider>);
}

beforeEach(() => {
  writeText.mockReset();
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

describe("BuildIdentity", () => {
  it("shows a compact label and accessible details", () => {
    renderBuildIdentity();
    expect(screen.getByText("DEV · Build 54")).toBeInTheDocument();
    expect(screen.getByText("r54-cb8a672")).toBeInTheDocument();
    expect(screen.getByText("cb8a672")).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
  });

  it("opens details from the keyboard and pointer-compatible summary control", () => {
    renderBuildIdentity();
    const summary = screen.getByText("DEV · Build 54");
    const details = summary.closest("details");

    expect(details).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(details).toHaveAttribute("open", "");
  });

  it("renders the semantic release version instead of a development label", () => {
    renderBuildIdentity({
      ...info,
      environment: "prd",
      environmentLabel: "PRD",
      primaryLabel: "v1.2.3",
      imageTag: "v1.2.3-r84-fa14a88",
      branch: "prd",
      releaseVersion: "v1.2.3",
    });

    expect(screen.getByText("v1.2.3", { selector: "summary" })).toBeInTheDocument();
    expect(screen.queryByText("DEV · Build 54")).not.toBeInTheDocument();
  });

  it("formats the dynamic build information for an offline-friendly clipboard payload", () => {
    expect(buildInfoClipboardText(info)).toBe([
      "환경: DEV",
      "버전: r54-cb8a672",
      "커밋: cb8a672",
      "브랜치: dev",
      "빌드 시각: 2026-08-29T06:38:27Z",
    ].join("\n"));
  });

  it("copies the displayed build information and reports success", async () => {
    writeText.mockResolvedValue(undefined);
    renderBuildIdentity();
    fireEvent.click(screen.getByText("DEV · Build 54"));
    fireEvent.click(screen.getByRole("button", { name: "빌드 정보 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(buildInfoClipboardText(info)));
    expect(screen.getByRole("status")).toHaveTextContent("복사됨");
    expect(screen.getByRole("button", { name: "복사됨" })).toBeInTheDocument();
  });

  it("centres the copy tooltip horizontally and reports a clipboard failure", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    renderBuildIdentity();
    fireEvent.click(screen.getByText("DEV · Build 54"));
    const copyButton = screen.getByRole("button", { name: "빌드 정보 복사" });
    fireEvent.focus(copyButton);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveAttribute("data-side", "top");
    expect(tooltip).toHaveAttribute("data-align", "center");

    fireEvent.click(copyButton);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("복사하지 못했습니다"));
  });
});
