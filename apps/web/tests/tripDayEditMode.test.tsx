import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TripPanelActions } from "../src/components/SplitMapShell";
import type { Me } from "../src/api";
import type { Trip } from "../src/types";

const trip: Trip = {
  id: "trip-1",
  title: "오사카 3박 4일",
  timezone: "Asia/Seoul",
  currency: "JPY",
  startDate: "2026-09-07",
  endDate: "2026-09-09",
  days: [
    { date: "2026-09-07", spots: [], legPreferences: [], groups: [] },
    { date: "2026-09-08", spots: [], legPreferences: [], groups: [] },
    { date: "2026-09-09", spots: [], legPreferences: [], groups: [] },
  ],
  cover: null,
};

// NewTripPage creates exactly this when no representative place is given.
const emptyTrip: Trip = { ...trip, id: "trip-2", days: [] };

const me: Me = { id: "user-1", email: "me@example.com", name: "나", status: "approved", role: "member" };

const panelActions: TripPanelActions = {
  isWide: false,
  position: "bottom",
  panelHidden: false,
  setPanelVisible: vi.fn(),
  choosePosition: vi.fn(),
};

// The day tabs are the unit under test; the map, sharing and place surfaces
// around them only need to stay out of the way.
vi.mock("../src/components/SplitMapShell", () => ({
  SplitMapShell: ({
    headerRight,
    panel,
  }: {
    headerRight?: ReactNode | ((actions: TripPanelActions) => ReactNode);
    panel: ReactNode;
  }) => (
    <div>
      {typeof headerRight === "function" ? headerRight(panelActions) : headerRight}
      {panel}
    </div>
  ),
}));
vi.mock("../src/components/TripMap", () => ({ TripMap: () => <div data-testid="trip-map" /> }));
vi.mock("../src/components/MapsScope", () => ({ MapsScope: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../src/components/TripShareButton", () => ({ TripShareButton: () => null }));
vi.mock("../src/components/PlaceDetailsPanel", () => ({ PlaceDetailsPanel: () => null }));
vi.mock("../src/components/LegInfo", () => ({ LegInfo: () => null }));
vi.mock("../src/components/PlaceAutocompleteInput", () => ({ PlaceAutocompleteInput: () => null }));
vi.mock("../src/hooks/useTripLocationSharing", () => ({ useTripLocationSharing: () => ({ status: null }) }));
vi.mock("../src/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api")>()),
  getTrip: vi.fn(async (id: string) => (id === emptyTrip.id ? emptyTrip : trip)),
  saveTrip: vi.fn(async (next: Trip) => next),
}));

const { TripDayPage } = await import("../src/pages/TripDayPage");

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});

function renderTrip(id: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TripDayPage id={id} navigate={vi.fn()} me={me} />
    </QueryClientProvider>,
  );
}

async function renderDay() {
  renderTrip(trip.id);
  return screen.findByRole("radiogroup", { name: "여행 날짜" });
}

function openMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "여행 더보기" }), { button: 0 });
}

async function turnOnEditing() {
  openMenu();
  fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "여행 편집" }));
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
}

describe("trip day editing mode", () => {
  it("keeps every day reachable without the date actions while only browsing", async () => {
    await renderDay();

    expect(screen.getByRole("radio", { name: "2026-09-09 일정" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "날짜 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /날짜 관리/ })).not.toBeInTheDocument();
  });

  it("reveals date add and date management once trip editing is on", async () => {
    await renderDay();
    await turnOnEditing();

    expect(screen.getByRole("group", { name: "날짜 추가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2026-09-07 날짜 관리" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "2026-09-07 일정. 우클릭하거나 길게 눌러 날짜 관리" })).toBeInTheDocument();
  });

  it("closes an open date dialog when editing is turned back off", async () => {
    await renderDay();
    await turnOnEditing();

    fireEvent.click(screen.getByRole("button", { name: "2026-09-07 날짜 관리" }));
    expect(await screen.findByRole("dialog", { name: "2026-09-07 날짜 관리" })).toBeInTheDocument();

    openMenu();
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "여행 편집" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "2026-09-07 날짜 관리" })).not.toBeInTheDocument());
    expect(screen.queryByRole("group", { name: "날짜 추가" })).not.toBeInTheDocument();
  });

  it("keeps the first date reachable on a trip that has no days yet", async () => {
    // The empty state tells the user to press "+ 날짜"; hiding it behind the
    // overflow menu would leave a new trip with no way forward.
    renderTrip(emptyTrip.id);

    expect(await screen.findByRole("group", { name: "날짜 추가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ 날짜" })).toBeInTheDocument();
  });

  it("releases the long-press guard when the pressed chip was already selected", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderDay();
    await turnOnEditing();

    // Long-pressing the selected chip deselects it in a single toggle group,
    // which used to leave the guard latched and swallow the next day switch.
    const selected = screen.getByRole("radio", { name: /2026-09-07 일정/ });
    fireEvent.pointerDown(selected, { pointerType: "touch" });
    await vi.advanceTimersByTimeAsync(1000);
    fireEvent.pointerUp(selected);
    fireEvent.click(selected);

    fireEvent.click(screen.getByRole("radio", { name: /2026-09-08 일정/ }));
    expect(screen.getByRole("button", { name: "2026-09-08 날짜 관리" })).toBeInTheDocument();
  });

  it("ignores the long-press date shortcut while only browsing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderDay();

    const day = screen.getByRole("radio", { name: "2026-09-08 일정" });
    fireEvent.pointerDown(day, { pointerType: "touch" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
