import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpotCard } from "../src/components/SpotCard";

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: { "data-sortable": "true" },
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock("../src/components/OpeningHours", () => ({ OpeningHours: () => null }));
vi.mock("../src/components/MarkdownView", () => ({ MarkdownView: () => null }));
vi.mock("../src/components/SpotForm", () => ({ SpotForm: ({ onCancel }: { onCancel: () => void }) => <button type="button" onClick={onCancel}>편집 취소</button> }));

const spot = {
  id: "spot-1",
  order: 0,
  name: "남산",
  placeId: "place-1",
  lat: 37.55,
  lng: 126.98,
  bufferMinutes: 10,
  items: [{ id: "item-1", kind: "todo" as const, title: "예약 확인", done: false }],
};

function renderCard(overrides: Partial<React.ComponentProps<typeof SpotCard>> = {}) {
  return render(
    <SpotCard
      spot={spot}
      onToggleItem={vi.fn()}
      onDeleteItem={vi.fn()}
      onAddItem={vi.fn()}
      onDeleteSpot={vi.fn()}
      onEditSpot={vi.fn()}
      selected={false}
      onSelect={vi.fn()}
      date="2026-08-29"
      {...overrides}
    />,
  );
}

function openMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "남산 더보기" }), { button: 0 });
}

beforeEach(() => vi.clearAllMocks());

describe("spot card actions", () => {
  it("uses shadcn menu and dialog primitives for edit and deletion", async () => {
    const onDeleteSpot = vi.fn();
    renderCard({ onDeleteSpot });

    expect(screen.getByRole("link", { name: /Google 지도에서 열기/ })).toHaveAttribute("target", "_blank");
    openMenu();
    expect(await screen.findByRole("menuitem", { name: "수정" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "삭제" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("이 장소와 목록을 삭제할까요?");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "삭제" }));
    fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
    expect(onDeleteSpot).toHaveBeenCalledTimes(1);
  });

  it("keeps item creation and deletion controls as configured Buttons", () => {
    const onDeleteItem = vi.fn();
    renderCard({ onDeleteItem });
    fireEvent.click(screen.getByRole("button", { name: "예약 확인 삭제" }));
    expect(onDeleteItem).toHaveBeenCalledWith("item-1");
    fireEvent.click(screen.getByRole("button", { name: "+ 살 것/먹을 것 추가" }));
    expect(screen.getByRole("button", { name: "추가" })).toBeDisabled();
  });

  it("shows reservation semantics, duration, and advisory overlap text without color-only meaning", () => {
    renderCard({
      spot: { ...spot, plannedArrival: "19:00", timeKind: "RESERVATION", dwellMinutes: 90 },
      scheduleWarning: "앞 일정의 예상 종료 19:30와 겹칩니다.",
    });

    expect(screen.getByText("19:00")).toBeVisible();
    expect(screen.getByText("20:30")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("앞 일정의 예상 종료 19:30와 겹칩니다.");
  });

  it("labels unscheduled stops instead of hiding their state", () => {
    renderCard();
    expect(screen.getByRole("button", { name: "남산 시작 시각 입력" })).toHaveTextContent(/시간 입력\s*필요/);
  });
});

describe("timeline node number", () => {
  it("shows the same number as the spot's map pin inside the timeline node", () => {
    const { container } = renderCard({ mapNumber: 3 });
    const node = container.querySelector(".timeline-node");
    expect(node).toHaveClass("has-number");
    expect(node).toHaveTextContent("3");
  });

  it("renders a plain node with no number for a spot missing coordinates", () => {
    const { container } = renderCard({ mapNumber: undefined });
    const node = container.querySelector(".timeline-node");
    expect(node).not.toHaveClass("has-number");
    expect(node?.textContent).toBe("");
  });

  it("marks the spot card so its connector line continues down to the next leg", () => {
    const { container: withLeg } = renderCard({ hasNextLeg: true });
    expect(withLeg.querySelector(".spot-card")).toHaveClass("has-next-leg");

    const { container: withoutLeg } = renderCard({ hasNextLeg: false });
    expect(withoutLeg.querySelector(".spot-card")).not.toHaveClass("has-next-leg");
  });
});
