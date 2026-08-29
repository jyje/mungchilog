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

function activateScene(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
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

  it("keeps location sharing opt-in in the collaboration scene", () => {
    renderStoryboard();

    activateScene("같이 보기");
    const sharing = screen.getByRole("switch", { name: "내 위치 공유" });
    expect(sharing).toHaveAttribute("data-state", "unchecked");
    expect(screen.getByText("이 여행의 참여자에게만 임시로 공유")).toBeVisible();

    fireEvent.click(sharing);
    expect(screen.getByText("위치 공유가 켜졌습니다. 언제든 여기서 끌 수 있습니다.")).toBeVisible();
  });

  it("keeps a recoverable map error visible beside other review states", () => {
    renderStoryboard();

    activateScene("상태");
    activateScene("복구 필요");
    expect(screen.getByText("지도를 불러오지 못했습니다.")).toBeVisible();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeVisible();
  });
});
