import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "../src/components/ui/tooltip";
import { ProductThemeGallery } from "../src/pages/gallery/ProductThemeGallery";

function renderThemeGallery() {
  return render(<TooltipProvider><ProductThemeGallery /></TooltipProvider>);
}

describe("product theme gallery", () => {
  it("shows independently operable ON and OFF location sharing without location access", () => {
    renderThemeGallery();
    const off = screen.getByRole("switch", { name: "내 위치 공유 OFF 예시" });
    const on = screen.getByRole("switch", { name: "내 위치 공유 ON 예시" });
    expect(off).toHaveAttribute("aria-checked", "false");
    expect(on).toHaveAttribute("aria-checked", "true");
    fireEvent.click(off);
    expect(off).toHaveAttribute("aria-checked", "true");
    expect(on).toHaveAttribute("aria-checked", "true");
    fireEvent.click(on);
    expect(on).toHaveAttribute("aria-checked", "false");
    expect(off).toHaveAttribute("aria-checked", "true");
  });

  it("documents the core inline primitives in the component catalog", () => {
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
