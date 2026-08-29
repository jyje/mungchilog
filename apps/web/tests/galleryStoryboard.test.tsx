import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GalleryStoryboard } from "../src/pages/gallery/GalleryStoryboard";
import { TooltipProvider } from "../src/components/ui/tooltip";

function renderStoryboard() {
  return render(
    <TooltipProvider>
      <GalleryStoryboard />
    </TooltipProvider>,
  );
}

describe("GalleryStoryboard", () => {
  it("moves through the core trip flow without leaving the storyboard", () => {
    renderStoryboard();

    expect(screen.getByText("아직 참여한 여행이 없습니다.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "새 여행 만들기" }));
    expect(screen.getByText("여행의 기본 정보를 입력합니다.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "첫날 일정 만들기" }));
    expect(screen.getByText("대표 장소가 첫 일정으로 추가되었습니다.")).toBeVisible();
    expect(screen.getByRole("button", { name: /오사카성/ })).toHaveAttribute("aria-current", "true");
  });

  it("switches the canvas between supported device sizes", () => {
    const { container } = renderStoryboard();

    fireEvent.click(screen.getByRole("button", { name: "태블릿" }));
    expect(container.querySelector("[data-storyboard-viewport]")).toHaveAttribute("data-storyboard-viewport", "tablet");

    fireEvent.click(screen.getByRole("button", { name: "데스크톱" }));
    expect(container.querySelector("[data-storyboard-viewport]")).toHaveAttribute("data-storyboard-viewport", "desktop");
  });
});
