import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "../src/components/ui/tooltip";
import { ProductThemeGallery } from "../src/pages/gallery/ProductThemeGallery";

function renderThemeGallery() {
  return render(<TooltipProvider><ProductThemeGallery /></TooltipProvider>);
}

describe("product theme gallery", () => {
  it("documents every interactive primitive used by product screens", () => {
    const { container } = renderThemeGallery();

    for (const slot of [
      "button",
      "toggle-group",
      "input",
      "textarea",
      "native-select",
      "checkbox",
      "switch",
      "radio-group",
      "tabs",
      "badge",
      "skeleton",
    ]) {
      expect(container.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
    }
  });

  it("uses the same outline single-choice contract for dates and travel modes", () => {
    renderThemeGallery();

    const dates = screen.getByRole("radiogroup", { name: "갤러리 여행 날짜" });
    const modes = screen.getByRole("radiogroup", { name: "갤러리 이동 수단" });
    expect(dates).toHaveAttribute("data-variant", "outline");
    expect(modes).toHaveAttribute("data-variant", "outline");
    expect(within(dates).getByRole("radio", { name: "9월 7일 (월)" })).toHaveAttribute("aria-checked", "true");
    expect(within(modes).getByRole("radio", { name: "대중교통" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(within(modes).getByRole("radio", { name: "도보" }));
    expect(within(modes).getByRole("radio", { name: "도보" })).toHaveAttribute("aria-checked", "true");
  });

  it("keeps grouped date creation as outline actions rather than state toggles", () => {
    renderThemeGallery();

    const group = screen.getByRole("group", { name: "날짜 추가" });
    for (const button of within(group).getAllByRole("button")) {
      expect(button).toHaveAttribute("data-variant", "outline");
      expect(button).toHaveClass("min-h-11");
    }
  });
});
