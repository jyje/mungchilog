import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TripShareButton } from "../src/components/TripShareButton";

const api = vi.hoisted(() => ({
  listTripMembers: vi.fn(),
  inviteToTrip: vi.fn(),
  removeTripMember: vi.fn(),
}));

vi.mock("../src/api", async () => {
  const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
  return { ...actual, ...api };
});

vi.mock("../src/components/LocationSharingControl", () => ({
  LocationSharingControl: () => <div data-testid="location-sharing-control" />,
}));

const me = {
  id: "owner-1",
  email: "owner@example.com",
  name: "여행 만든 사람",
  status: "approved",
  role: "member",
} as const;

const members = [
  { id: "owner-1", email: "owner@example.com", name: "여행 만든 사람", role: "owner" as const },
  { id: "editor-1", email: "editor@example.com", name: "함께 가는 사람", role: "editor" as const },
];

function renderShareButton() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TripShareButton
        tripId="trip-1"
        me={me}
        sharedLocations={[]}
        onLocationsChange={vi.fn()}
        onFocusLocation={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.listTripMembers.mockResolvedValue(members);
  api.inviteToTrip.mockResolvedValue({ invited: "new@example.com" });
  api.removeTripMember.mockResolvedValue({ removed: true });
});

describe("trip share sheet", () => {
  it("opens a modal sheet and returns focus through the shadcn dialog primitives", async () => {
    renderShareButton();
    const trigger = screen.getByRole("button", { name: "같이 보는 사람" });

    fireEvent.click(trigger);

    expect(await screen.findByRole("dialog")).toHaveTextContent("이 여행을 같이 보는 사람");
    expect(await screen.findByText("함께 가는 사람")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("keeps the owner invite action available with a configured Button", async () => {
    renderShareButton();
    fireEvent.click(screen.getByRole("button", { name: "같이 보는 사람" }));

    const input = await screen.findByRole("textbox", { name: "이메일로 초대" });
    fireEvent.change(input, { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "이메일로 초대" }));

    await waitFor(() => expect(api.inviteToTrip).toHaveBeenCalledWith("trip-1", "new@example.com"));
    expect(await screen.findByRole("status")).toHaveTextContent("초대했어요");
  });
});
