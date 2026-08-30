import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SplitMapShell } from "../src/components/SplitMapShell";
import { useMapViewportInsets } from "../src/components/MapViewportContext";
import { closestSheetState, mapViewportInsets } from "../src/components/mapViewportGeometry";

const STORAGE_KEY = "mungchilog:trip-panel-layout:v1";

function viewport(width: number, height = 800) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  act(() => window.dispatchEvent(new Event("resize")));
}

function savedLayout(position: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ position, sizes: { bottom: 46, left: 420, right: 400 }, floating: { x: 750, y: 160, width: 420, height: 500 } }));
}

function InsetProbe() {
  return <output data-testid="insets">{JSON.stringify(useMapViewportInsets())}</output>;
}

function shell() {
  return render(
    <SplitMapShell
      map={<InsetProbe />}
      headerLeft={<button type="button" aria-label="여행 목록으로" />}
      headerRight={<><button type="button" aria-label="같이 보는 사람" /><button type="button" aria-label="여행 더보기" /></>}
      title="여행 일정"
      subtitle="8월 24일 (월) · Asia/Seoul"
      panel={<textarea aria-label="메모" defaultValue="저장 전 메모" />}
    />,
  );
}

beforeEach(() => {
  const items = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
    clear: () => items.clear(),
  });
  viewport(1200);
});

describe("adaptive map shell", () => {
  it.each([360, 390, 600, 768, 840])("uses an operable bottom sheet at %ipx without overwriting desktop preference", (width) => {
    savedLayout("right");
    viewport(width);
    const { container } = shell();
    expect(container.firstChild).toHaveAttribute("data-panel-position", "bottom");
    expect(screen.getByRole("button", { name: "중간" })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).position).toBe("right");
  });

  it.each(["right", "left", "floating"])("restores %s preference after rotation or split-screen", (position) => {
    savedLayout(position);
    const { container } = shell();
    expect(container.firstChild).toHaveAttribute("data-panel-position", position);
    viewport(600);
    expect(container.firstChild).toHaveAttribute("data-panel-position", "bottom");
    viewport(1200);
    expect(container.firstChild).toHaveAttribute("data-panel-position", position);
  });

  it("keeps the same unsaved editor mounted through all sheet states and desktop adaptation", () => {
    viewport(390);
    shell();
    const draft = screen.getByRole("textbox", { name: "메모" });
    fireEvent.change(draft, { target: { value: "아직 저장하지 않은 변경" } });
    fireEvent.click(screen.getByRole("button", { name: "접힘" }));
    expect(draft.parentElement).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: /일정 패널 접힘/ })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "펼침" }));
    expect(screen.getByRole("textbox", { name: "메모" })).toBe(draft);
    viewport(1200);
    expect(screen.getByRole("textbox", { name: "메모" })).toBe(draft);
    expect(draft).toHaveValue("아직 저장하지 않은 변경");
  });

  it("supports arrow and Home/End keyboard control of each sheet state", () => {
    viewport(390);
    const { container } = shell();
    const handle = screen.getByRole("button", { name: /일정 패널 중간/ });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(container.firstChild).toHaveAttribute("data-sheet-state", "expanded");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(container.firstChild).toHaveAttribute("data-sheet-state", "collapsed");
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(container.firstChild).toHaveAttribute("data-sheet-state", "collapsed");
    fireEvent.keyDown(handle, { key: "End" });
    expect(container.firstChild).toHaveAttribute("data-sheet-state", "expanded");
  });

  it("toggles the visible desktop panel after a collapsed phone sheet without losing sheet preference", () => {
    viewport(390);
    shell();
    fireEvent.click(screen.getByRole("button", { name: "접힘" }));
    viewport(1200);
    fireEvent.click(screen.getByRole("button", { name: "일정 목록 보기 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "일정 목록 접기" }));
    expect(screen.getByRole("complementary", { hidden: true })).toHaveAttribute("hidden");
    fireEvent.click(screen.getByRole("button", { name: "일정 목록 보기 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "일정 목록 보이기" }));
    expect(screen.getByRole("complementary")).not.toHaveAttribute("hidden");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).sheetState).toBe("collapsed");
  });

  it("supports touch dragging to a snap point without immediately cycling on the following click", () => {
    // jsdom has no native PointerEvent geometry.
    vi.stubGlobal("PointerEvent", MouseEvent);
    viewport(390);
    const { container } = shell();
    const panel = screen.getByRole("complementary", { name: "여행 일정 패널" });
    Object.defineProperty(panel, "clientHeight", { configurable: true, value: 336 });
    const handle = screen.getByRole("button", { name: /일정 패널 중간/ });
    fireEvent.pointerDown(handle, { clientY: 464, clientX: 50 });
    fireEvent.pointerMove(window, { clientY: 180, clientX: 50 });
    fireEvent.pointerUp(window, { clientY: 180, clientX: 50 });
    fireEvent.click(handle);
    expect(container.firstChild).toHaveAttribute("data-sheet-state", "expanded");
    expect(document.body).not.toHaveClass("trip-panel-resizing");
  });

  it("resizes docked and floating panels with the keyboard", () => {
    shell();
    const panel = screen.getByRole("complementary");
    fireEvent.keyDown(screen.getByRole("button", { name: "일정 패널 너비 조절" }), { key: "ArrowLeft" });
    expect(panel.style.width).toContain("404px");
    fireEvent.click(screen.getByRole("button", { name: "일정 목록 보기 설정" }));
    fireEvent.click(screen.getByRole("button", { name: /플로팅 패널/ }));
    const originalWidth = parseFloat(panel.style.width);
    fireEvent.keyDown(screen.getByRole("button", { name: "패널 left 경계 크기 조절" }), { key: "ArrowLeft" });
    expect(parseFloat(panel.style.width)).toBe(originalWidth + 24);
  });

  it("exposes all floating resize edges as keyboard and touch targets", () => {
    shell();
    fireEvent.click(screen.getByRole("button", { name: "일정 목록 보기 설정" }));
    fireEvent.click(screen.getByRole("button", { name: /플로팅 패널/ }));

    const handles = screen.getAllByRole("button", { name: /패널 .* 경계 크기 조절/ });
    expect(handles).toHaveLength(8);
    expect(handles.every((handle) => handle.classList.contains("floating-resize-handle"))).toBe(true);
  });

  it("dismisses the layout menu with Escape and restores focus without forwarding the key", () => {
    shell();
    const menu = screen.getByRole("button", { name: "일정 목록 보기 설정" });
    const selectionEscape = vi.fn();
    window.addEventListener("keydown", selectionEscape);
    fireEvent.click(menu);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(menu).toHaveFocus();
    expect(screen.queryByRole("group", { name: "일정 목록 및 패널 배치" })).not.toBeInTheDocument();
    expect(selectionEscape).not.toHaveBeenCalled();
    window.removeEventListener("keydown", selectionEscape);
  });

  it("places the itinerary control immediately before people and overflow actions", () => {
    const { container } = shell();
    const actions = container.querySelector(".trip-header-actions");

    expect(actions).not.toBeNull();
    expect(Array.from(actions!.querySelectorAll("button"), (button) => button.getAttribute("aria-label"))).toEqual([
      "화면 테마 메뉴",
      "일정 목록 보기 설정",
      "같이 보는 사람",
      "여행 더보기",
    ]);
  });

  it("still renders when layout storage is unavailable or corrupt", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new DOMException("blocked"); });
    expect(() => shell()).not.toThrow();
    expect(screen.getByRole("heading", { name: "여행 일정" })).toBeInTheDocument();
  });

  it("provides measured header insets relative to the already resized map", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      if (this.classList.contains("trip-map-pane")) return new DOMRect(400, 0, 800, 800);
      if (this.classList.contains("map-hero-header")) return new DOMRect(408, 8, 784, 96);
      return new DOMRect(0, 0, 1200, 800);
    });
    savedLayout("left");
    shell();
    expect(JSON.parse(screen.getByTestId("insets").textContent!)).toEqual({ top: 116, right: 0, bottom: 0, left: 0 });
  });

  it("follows the visual viewport when a software keyboard opens and unsubscribes on unmount", () => {
    const viewportEvents = new EventTarget();
    const visualViewport = Object.assign(viewportEvents, { height: 800, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });
    const remove = vi.spyOn(visualViewport, "removeEventListener");
    const { container, unmount } = shell();
    act(() => {
      visualViewport.height = 420;
      visualViewport.offsetTop = 40;
      visualViewport.dispatchEvent(new Event("resize"));
    });
    expect(container.firstChild).toHaveStyle({ height: "420px", top: "40px" });
    expect(container.firstChild).toHaveAttribute("data-compact-map", "true");
    viewport(390, 420);
    expect(screen.getByRole("complementary").style.maxHeight).toContain("240px");
    unmount();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
  });
});

describe("unobscured map geometry", () => {
  it("does not count a docked panel twice", () => {
    expect(mapViewportInsets(new DOMRect(400, 0, 800, 800), new DOMRect(408, 8, 784, 88))).toEqual({ top: 108, right: 0, bottom: 0, left: 0 });
  });

  it("reserves the largest visible rectangle beside a floating panel", () => {
    expect(mapViewportInsets(new DOMRect(0, 0, 1200, 800), new DOMRect(8, 8, 1184, 88), new DOMRect(760, 180, 420, 500))).toEqual({ top: 108, right: 452, bottom: 0, left: 0 });
  });

  it("ignores out-of-map panels and clamps a header larger than the viewport", () => {
    expect(mapViewportInsets(new DOMRect(0, 0, 360, 160), new DOMRect(8, 8, 344, 180), new DOMRect(500, 0, 300, 400))).toEqual({ top: 160, right: 0, bottom: 0, left: 0 });
  });

  it.each([[80, "collapsed"], [330, "intermediate"], [620, "expanded"]] as const)("snaps a %ipx sheet to %s", (height, state) => {
    expect(closestSheetState(height, 800)).toBe(state);
  });
});
