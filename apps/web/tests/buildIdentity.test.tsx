import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BuildIdentity } from "../src/components/system/BuildIdentity";
import type { BuildInfo } from "../src/buildInfo";

const info: BuildInfo = {
  environment: "dev",
  environmentLabel: "DEV",
  buildNumber: "54",
  imageTag: "r54-cb8a672",
  commitSha: "cb8a672",
  branch: "dev",
  builtAt: "2026-08-29T06:38:27Z",
};

describe("BuildIdentity", () => {
  it("shows a compact label and accessible details", () => {
    render(<BuildIdentity info={info} />);
    expect(screen.getByText("DEV · Build 54")).toBeInTheDocument();
    expect(screen.getByText("r54-cb8a672")).toBeInTheDocument();
    expect(screen.getByText("cb8a672")).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
  });

  it("opens details from the keyboard and pointer-compatible summary control", () => {
    render(<BuildIdentity info={info} />);
    const summary = screen.getByText("DEV · Build 54");
    const details = summary.closest("details");

    expect(details).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(details).toHaveAttribute("open", "");
  });
});
