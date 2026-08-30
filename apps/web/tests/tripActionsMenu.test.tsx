import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TripActionsMenu } from "../src/components/TripActionsMenu";
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
  vi.stubGlobal("confirm", vi.fn(() => true));
});

function renderMenu(overrides: { onExport?: () => void; onSave?: (trip: Trip) => void } = {}) {
  const onExport = overrides.onExport ?? vi.fn();
  const onSave = overrides.onSave ?? vi.fn();
  render(<TripActionsMenu trip={trip} onSave={onSave} onExport={onExport} saving={false} />);
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
