import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TripActionsMenu } from "../src/components/TripActionsMenu";
import type { TripPanelActions } from "../src/components/SplitMapShell";
import type { Trip } from "../src/types";

vi.mock("../src/components/TripCoverEditor", () => ({
  TripCoverEditor: ({ onDirtyChange }: { onDirtyChange: (spotId: string, imageDataUrl: string) => void }) => (
    <button type="button" onClick={() => onDirtyChange("spot-1", "changed")}>mark dirty</button>
  ),
}));

const trip: Trip = {
  id: "trip-1",
  title: "서울 여행",
  timezone: "Asia/Seoul",
  currency: "KRW",
  startDate: "2026-08-29",
  endDate: "2026-08-29",
  days: [{ date: "2026-08-29", spots: [{ id: "spot-1", order: 0, name: "남산", bufferMinutes: 10, items: [] }] }],
  cover: null,
};

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

function renderMenu(overrides: { onExport?: () => void; onSave?: (trip: Trip) => void; panelActions?: TripPanelActions } = {}) {
  const onExport = overrides.onExport ?? vi.fn();
  const onSave = overrides.onSave ?? vi.fn();
  render(<TripActionsMenu trip={trip} onSave={onSave} onExport={onExport} saving={false} panelActions={overrides.panelActions} />);
  return { onExport, onSave };
}

function openMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "여행 더보기" }), { button: 0 });
}

describe("trip actions menu", () => {
  it("moves the JSON export action into the overflow menu", async () => {
    const { onExport } = renderMenu();

    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "여행 내보내기 (.json)" }));

    expect(onExport).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("switches theme from the existing overflow instead of adding a toolbar button", async () => {
    renderMenu();
    openMenu();
    expect(await screen.findByText("화면")).toBeVisible();
    fireEvent.click(screen.getByRole("menuitem", { name: "다크 테마로 전환" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("mungchilog-theme")).toBe("dark");
  });

  it("keeps desktop itinerary visibility and placement in one screen submenu", async () => {
    const panelActions: TripPanelActions = {
      isWide: true,
      position: "right",
      panelHidden: false,
      setPanelVisible: vi.fn(),
      choosePosition: vi.fn(),
    };
    renderMenu({ panelActions });
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "일정 패널" }));

    const visibility = await screen.findByRole("menuitemcheckbox", { name: "일정 목록 표시" });
    expect(visibility).toHaveAttribute("data-state", "checked");
    fireEvent.click(visibility);
    expect(panelActions.setPanelVisible).toHaveBeenCalledWith(false);

    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "일정 패널" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "좌측" }));
    expect(panelActions.choosePosition).toHaveBeenCalledWith("left");
  });

  it("opens the settings dialog from the shadcn dropdown and closes it through DialogClose", async () => {
    renderMenu();
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "대표 화면 설정" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("대표 화면 설정");
    fireEvent.click(screen.getByRole("button", { name: "대표 화면 설정 닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps a dirty editor open when the user rejects the discard confirmation", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    renderMenu();

    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "대표 화면 설정" }));
    fireEvent.click(await screen.findByRole("button", { name: "mark dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "대표 화면 설정 닫기" }));

    expect(confirm).toHaveBeenCalledWith("저장하지 않은 대표 화면 설정을 버릴까요?");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
