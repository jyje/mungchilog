import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GalleryPage } from "../src/pages/GalleryPage";
import { TooltipProvider } from "../src/components/ui/tooltip";

describe("gallery light theme", () => {
  beforeEach(() => {
    const values = new Map<string, string>([["mungchilog-theme", "light"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  it("renders light-theme neutral button compositions inside the gallery", () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
    render(<TooltipProvider><GalleryPage /></TooltipProvider>, { container: root });

    const outline = screen.getByRole("button", { name: "초대하기" });
    const ghost = screen.getByRole("button", { name: "취소" });
    expect(root).toHaveClass("gallery-root");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(outline).toHaveAttribute("data-variant", "outline");
    expect(ghost).toHaveAttribute("data-variant", "ghost");
    expect(root.querySelectorAll('[data-slot="button"][data-variant="outline"], [data-slot="button"][data-variant="ghost"]')).not.toHaveLength(0);
  });
});
