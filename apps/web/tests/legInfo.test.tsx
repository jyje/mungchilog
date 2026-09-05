import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LegInfo } from "../src/components/LegInfo";
import type { Leg } from "../src/api";
import type { LegPreference, Spot } from "../src/types";

const useLegMock = vi.fn();
vi.mock("../src/hooks/useLeg", async () => {
  const actual = await vi.importActual<typeof import("../src/hooks/useLeg")>("../src/hooks/useLeg");
  return { ...actual, useLeg: (...args: unknown[]) => useLegMock(...args) };
});

const from: Spot = {
  id: "from",
  order: 0,
  name: "도쿄역",
  placeId: "place-tokyo",
  lat: 35.68,
  lng: 139.76,
  plannedArrival: "09:00",
  dwellMinutes: 30,
  bufferMinutes: 10,
  items: [],
};
// Deliberately coordinate-only: a stop dropped on the map has no place id,
// and must still be routable.
const to: Spot = { id: "to", order: 1, name: "지도 지점", lat: 35.7, lng: 139.8, bufferMinutes: 10, items: [] };

function preferenceOf(overrides: Partial<LegPreference> = {}): LegPreference {
  return {
    fromSpotId: "from",
    toSpotId: "to",
    mode: "TRANSIT",
    routeIndex: 0,
    timing: { kind: "AUTO" },
    trafficAware: false,
    ...overrides,
  };
}

function legOf(routes: Array<Partial<Leg["routes"][number]>>): Leg {
  return {
    fetchedAt: "2026-09-07T00:00:00.000Z",
    routes: routes.map((route, index) => ({
      distanceM: 1000,
      durationS: 600,
      fareAmount: null,
      fareCurrency: null,
      polyline: `poly-${index}`,
      label: index === 0 ? "DEFAULT_ROUTE" : "DEFAULT_ROUTE_ALTERNATE",
      key: `key-${index}`,
      ...route,
    })),
  };
}

// Everything below "수정" (mode toggle, timing, traffic switch, route
// picker) renders collapsed by default (see "editing the leg" below for that
// behaviour itself); every other describe block here is about what's inside
// once open, so the helper opens it unless a test asks not to.
function renderLeg(overrides: Partial<React.ComponentProps<typeof LegInfo>> = {}, options: { edit?: boolean } = {}) {
  const onChange = vi.fn();
  const onSelect = vi.fn();
  const { container } = render(
    <LegInfo
      from={from}
      to={to}
      date="2026-09-07"
      timezone="Asia/Tokyo"
      preference={preferenceOf()}
      selected={false}
      onSelect={onSelect}
      onChange={onChange}
      {...overrides}
    />,
  );
  if (options.edit ?? true) fireEvent.click(screen.getByRole("button", { name: /경로 수정/ }));
  return { onChange, onSelect, container };
}

beforeEach(() => {
  useLegMock.mockReset();
  useLegMock.mockReturnValue({ data: undefined, isError: false, isLoading: false });
});

describe("choosing how to travel a leg", () => {
  it("offers only walking, transit, and driving", () => {
    renderLeg();
    const group = screen.getByRole("radiogroup", { name: /이동 수단/ });
    expect(within(group).getAllByRole("radio").map((item) => item.textContent)).toEqual(["도보", "대중교통", "운전"]);
    expect(within(group).queryByText("직선")).toBeNull();
  });

  it("saves the chosen mode", () => {
    const { onChange } = renderLeg();
    fireEvent.click(screen.getByRole("radio", { name: /보행자 경로/ }));
    expect(onChange).toHaveBeenCalledWith({ mode: "WALK" });
  });

  it("routes a coordinate-only endpoint rather than skipping the leg", () => {
    renderLeg();
    // The hook is called with the spots themselves; it is what turns a
    // placeId-less stop into a latLng waypoint.
    expect(useLegMock).toHaveBeenCalled();
    expect(useLegMock.mock.calls[0][1]).toBe(to);
    expect(screen.getByRole("radiogroup", { name: /이동 수단/ })).toBeInTheDocument();
  });
});

describe("a leg saved before real routes existed", () => {
  it("shows the straight line as unavailable and asks for a real mode", () => {
    renderLeg({ preference: preferenceOf({ mode: "DIRECT" }) });
    expect(screen.getByRole("status")).toHaveTextContent("직선 표시는 더 이상 지원하지 않습니다");
    // Nothing in the picker is pressed, so no legacy mode is being promoted.
    const group = screen.getByRole("radiogroup", { name: /이동 수단/ });
    for (const item of within(group).getAllByRole("radio")) {
      expect(item).toHaveAttribute("aria-checked", "false");
    }
  });
});

describe("transit timing", () => {
  it("summarises automatic timing and explains where it comes from", () => {
    renderLeg();
    fireEvent.click(screen.getByRole("button", { name: /자동/ }));
    expect(screen.getByText(/앞 장소의 도착 시각과 머무는 시간/)).toBeInTheDocument();
  });

  it("saves a chosen departure only once applied", async () => {
    const { onChange } = renderLeg();
    fireEvent.click(screen.getByRole("button", { name: /자동/ }));
    fireEvent.click(await screen.findByRole("radio", { name: "출발 시각" }));
    fireEvent.change(screen.getByLabelText("시각"), { target: { value: "11:30" } });
    // Nothing is persisted while the popover is still being edited.
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(onChange).toHaveBeenCalledWith({ timing: { kind: "DEPART_AT", time: "11:30" } });
  });

  it("discards an abandoned edit instead of showing it as saved", async () => {
    const { onChange } = renderLeg();
    fireEvent.click(screen.getByRole("button", { name: /자동/ }));
    fireEvent.click(await screen.findByRole("radio", { name: "도착 시각" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: /자동/ })).toBeInTheDocument());
  });

  it("cannot apply a chosen time that was left blank", async () => {
    renderLeg();
    fireEvent.click(screen.getByRole("button", { name: /자동/ }));
    fireEvent.click(await screen.findByRole("radio", { name: "출발 시각" }));
    expect(screen.getByRole("button", { name: "적용" })).toBeDisabled();
  });

  it("offers arrive-by on a transit leg", async () => {
    renderLeg();
    fireEvent.click(screen.getByRole("button", { name: /자동/ }));
    expect(await screen.findByRole("radio", { name: "도착 시각" })).toBeInTheDocument();
  });

  it("does not offer a timing editor on a driving leg", () => {
    // Arrive-by is transit-only, so a drive has no timing choice to make.
    renderLeg({ preference: preferenceOf({ mode: "DRIVE" }) });
    expect(screen.queryByRole("button", { name: /자동/ })).toBeNull();
  });
});

describe("route alternatives", () => {
  it("summarises a transit route by its vehicle, line, and direction", () => {
    useLegMock.mockReturnValue({
      data: legOf([{
        transit: [{ vehicle: "SUBWAY", line: "Sakaisuji Line", headsign: "Tenjinbashisuji 6-chome" }],
      }]),
      isError: false,
      isLoading: false,
    });
    const { container } = renderLeg();

    // Not a single button: each boarded vehicle is its own click target (see
    // "selecting one boarded vehicle" below), so the summary is a plain
    // container now rather than one <button role>.
    const summary = container.querySelector(".leg-summary");
    expect(summary).toHaveTextContent("Sakaisuji Line · Tenjinbashisuji 6-chome");
    expect(summary).not.toHaveTextContent("대중교통");
  });

  it("shows a matching icon for each vehicle when the trip transfers between them", () => {
    useLegMock.mockReturnValue({
      data: legOf([{
        transit: [
          { vehicle: "SUBWAY", line: "Sakaisuji Line", headsign: "Tenjinbashisuji 6-chome" },
          { vehicle: "BUS", line: "Osaka City Bus 62", headsign: "Osaka Station" },
        ],
      }]),
      isError: false,
      isLoading: false,
    });
    const { container } = renderLeg();

    const summary = container.querySelector(".leg-summary");
    expect(summary).toHaveTextContent("Sakaisuji Line · Tenjinbashisuji 6-chome 방면 → Osaka City Bus 62 · Osaka Station 방면");
    // The icon changes at the transfer - not a subway icon carried through
    // the whole line, and not just a train icon for a bus leg.
    expect(container.querySelectorAll(".lucide-train-front")).toHaveLength(1);
    expect(container.querySelectorAll(".lucide-bus-front")).toHaveLength(1);
  });

  it("shows duration, distance, and estimated departure and arrival", () => {
    useLegMock.mockReturnValue({ data: legOf([{ durationS: 600 }, { durationS: 1500 }]), isError: false, isLoading: false });
    renderLeg();
    // AUTO timing: 09:00 arrival + 30m dwell = 09:30 departure, +10m = 09:40.
    expect(screen.getByLabelText(/추천/).closest("label")).toHaveTextContent("10분 · 1.0km · 09:30→09:40");
    expect(screen.getByLabelText(/대안 1/).closest("label")).toHaveTextContent("25분 · 1.0km · 09:30→09:55");
  });

  it("persists the fingerprint of the chosen alternative, not only its position", () => {
    useLegMock.mockReturnValue({ data: legOf([{}, {}]), isError: false, isLoading: false });
    const { onChange } = renderLeg();
    fireEvent.click(screen.getByLabelText(/대안 1/));
    expect(onChange).toHaveBeenCalledWith({ routeIndex: 1, routeKey: "key-1" });
  });

  it("keeps the saved journey selected after the provider reorders the list", () => {
    // "key-1" now comes back first. Selection must follow the journey.
    useLegMock.mockReturnValue({
      data: legOf([{ key: "key-1" }, { key: "key-0" }]),
      isError: false,
      isLoading: false,
    });
    renderLeg({ preference: preferenceOf({ routeIndex: 1, routeKey: "key-1" }) });
    expect(screen.getByLabelText(/추천/)).toHaveAttribute("aria-checked", "true");
  });

  it("labels alternatives by what actually makes them different, not just position", () => {
    useLegMock.mockReturnValue({
      data: legOf([
        { label: "DEFAULT_ROUTE_ALTERNATE", durationS: 900, distanceM: 4000, fareAmount: 1500 },
        { label: "DEFAULT_ROUTE", durationS: 600, distanceM: 5000, fareAmount: 1200 },
      ]),
      isError: false,
      isLoading: false,
    });
    renderLeg();
    // The faster, cheaper, but longer route is the recommended one - and
    // "fastest"/"cheapest" follow it, while "shortest" stays on the other.
    expect(screen.getByLabelText(/최소 시간/).closest("label")).toHaveTextContent("추천");
    expect(screen.getByLabelText(/최소 시간/).closest("label")).toHaveTextContent("최저 요금");
    expect(screen.getByLabelText(/최단 거리/).closest("label")).not.toHaveTextContent("추천");
  });

  it("hides the picker when there is nothing to choose between", () => {
    useLegMock.mockReturnValue({ data: legOf([{}]), isError: false, isLoading: false });
    renderLeg();
    expect(screen.queryByText("경로 선택")).toBeNull();
  });
});

describe("driving with live traffic", () => {
  it("is opt-in and labelled as short-lived", () => {
    renderLeg({ preference: preferenceOf({ mode: "DRIVE" }) });
    const toggle = screen.getByRole("switch", { name: /실시간 교통/ });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText(/몇 분 동안만 유효/)).toBeNull();
  });

  it("explains the freshness limit once enabled", () => {
    renderLeg({ preference: preferenceOf({ mode: "DRIVE", trafficAware: true }) });
    expect(screen.getByText(/몇 분 동안만 유효/)).toBeInTheDocument();
  });

  it("is not offered for transit or walking legs", () => {
    renderLeg({ preference: preferenceOf({ mode: "TRANSIT" }) });
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

describe("when the provider cannot answer", () => {
  it("labels the straight line as a temporary preview and keeps the chosen mode", () => {
    useLegMock.mockReturnValue({ data: undefined, isError: true, isLoading: false });
    renderLeg();
    expect(screen.getByRole("status")).toHaveTextContent("임시로 직선 미리보기");
    // The picker still reports transit, so the failure did not rewrite the save.
    expect(screen.getByRole("radio", { name: /대중교통 시간표 경로/ })).toHaveAttribute("aria-checked", "true");
  });
});

describe("editing the leg", () => {
  it("keeps the mode toggle and route picker collapsed until 수정 is opened", () => {
    renderLeg({}, { edit: false });
    expect(screen.queryByRole("radiogroup", { name: /이동 수단/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /경로 수정/ }));
    expect(screen.getByRole("radiogroup", { name: /이동 수단/ })).toBeInTheDocument();
  });

  it("closes again on a second click", () => {
    renderLeg({}, { edit: false });
    const toggle = screen.getByRole("button", { name: /경로 수정/ });
    fireEvent.click(toggle);
    expect(screen.getByRole("radiogroup", { name: /이동 수단/ })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByRole("radiogroup", { name: /이동 수단/ })).toBeNull();
  });
});

describe("selecting one boarded vehicle from the summary", () => {
  function transitLeg(overrides: Partial<React.ComponentProps<typeof LegInfo>> = {}) {
    useLegMock.mockReturnValue({
      data: legOf([{
        transit: [
          { vehicle: "SUBWAY", line: "Sakaisuji Line", headsign: "Tenjinbashisuji 6-chome" },
          { vehicle: "BUS", line: "Osaka City Bus 62", headsign: "Osaka Station" },
        ],
      }]),
      isError: false,
      isLoading: false,
    });
    return renderLeg({ selected: true, ...overrides }, { edit: false });
  }

  it("passes the vehicle's own index, not the whole-leg selection", () => {
    const { onSelect } = transitLeg();
    fireEvent.click(screen.getByRole("button", { name: /Osaka City Bus 62.*강조/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("selects the whole leg (no index) from the duration/fare summary instead", () => {
    useLegMock.mockReturnValue({ data: legOf([{ durationS: 600, distanceM: 1000 }]), isError: false, isLoading: false });
    const { onSelect } = renderLeg({ selected: true }, { edit: false });
    fireEvent.click(screen.getByText(/10분/));
    expect(onSelect).toHaveBeenCalledWith();
  });

  it("marks only the boarded vehicle matching selectedRideRunIndex as pressed", () => {
    transitLeg({ selectedRideRunIndex: 1 });
    expect(screen.getByRole("button", { name: /Sakaisuji Line.*강조/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Osaka City Bus 62.*강조/ })).toHaveAttribute("aria-pressed", "true");
  });
});
