import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentLocation } from "../src/components/CurrentLocation";
import { ItineraryFollowControl } from "../src/components/ItineraryFollowControl";
import { TripMap } from "../src/components/TripMap";
import { MapViewportProvider } from "../src/components/MapViewportContext";

const maps = vi.hoisted(() => ({
  map: { panTo: vi.fn(), panBy: vi.fn(), fitBounds: vi.fn(), setZoom: vi.fn(), setCenter: vi.fn(), getZoom: vi.fn(() => 15) },
  status: "LOADED",
  circle: vi.fn(),
}));
vi.mock("@vis.gl/react-google-maps", () => ({
  useMap: () => maps.map,
  useApiLoadingStatus: () => maps.status,
  APILoadingStatus: { FAILED: "FAILED", AUTH_FAILURE: "AUTH_FAILURE", LOADED: "LOADED" },
  AdvancedMarkerAnchorPoint: { CENTER: ["50%", "50%"] },
  AdvancedMarker: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Circle: (props: unknown) => { maps.circle(props); return null; },
  Map: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pin: () => null,
}));
vi.mock("../src/components/RouteOverlay", () => ({ RouteOverlay: () => null }));

const NOW = 1_800_000_000_000;
let success: PositionCallback;
let error: PositionErrorCallback;
let clearWatch: ReturnType<typeof vi.fn>;
let watchPosition: ReturnType<typeof vi.fn>;
function update(timestamp: number, accuracy = 15) {
  act(() => success({ coords: { latitude: 37.5, longitude: 127, accuracy }, timestamp } as GeolocationPosition));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("isSecureContext", true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  clearWatch = vi.fn();
  watchPosition = vi.fn((onSuccess: PositionCallback, onError: PositionErrorCallback) => {
    success = onSuccess;
    error = onError;
    return 1;
  });
  vi.stubGlobal("navigator", { geolocation: { watchPosition, clearWatch } });
  maps.status = "LOADED";
});

describe("current location control", () => {
  it("starts itinerary follow only after an explicit tap and Escape stops it", () => {
    const onSelect = vi.fn();
    render(
      <MapViewportProvider value={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <ItineraryFollowControl
          spots={[
            { id: "one", name: "One", lat: 37, lng: 127, order: 0, items: [], bufferMinutes: 10 },
            { id: "two", name: "Two", lat: 37.1, lng: 127.1, order: 1, items: [], bufferMinutes: 10 },
          ]}
          selection={null}
          onSelect={onSelect}
        />
      </MapViewportProvider>,
    );
    const button = screen.getByRole("button", { name: "따라가기" });
    expect(watchPosition).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith({ kind: "leg", fromId: "one", toId: "two" });
    expect(watchPosition).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "따라가기 중지" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "따라가기" })).toHaveAttribute("aria-pressed", "false");
  });

  it("long-press previews the tooltip without requesting GPS and a later tap still works", () => {
    vi.stubGlobal("PointerEvent", class extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerType = init.pointerType ?? ""; }
    });
    const { unmount } = render(<CurrentLocation />);
    const button = screen.getByRole("button", { name: "현재 위치" });
    fireEvent.pointerDown(button, { pointerType: "touch", clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(600));
    expect(button.parentElement).toHaveClass("show-touch-tooltip");
    fireEvent.pointerUp(button);
    fireEvent.click(button);
    expect(watchPosition).not.toHaveBeenCalled();
    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.pointerUp(button);
    fireEvent.click(button);
    expect(watchPosition).toHaveBeenCalledTimes(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels touch gestures that move or leave without requesting GPS", () => {
    vi.stubGlobal("PointerEvent", class extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerType = init.pointerType ?? ""; }
    });
    const { unmount } = render(<CurrentLocation />);
    const button = screen.getByRole("button", { name: "현재 위치" });
    fireEvent.pointerDown(button, { pointerType: "touch", clientX: 20, clientY: 20 });
    fireEvent.pointerMove(button, { pointerType: "touch", clientX: 50, clientY: 20 });
    act(() => vi.advanceTimersByTime(600));
    fireEvent.click(button);
    expect(button.parentElement).not.toHaveClass("show-touch-tooltip");
    expect(watchPosition).not.toHaveBeenCalled();
    fireEvent.pointerDown(button, { pointerType: "pen" });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses panel insets for an explicit recenter without repanning on a layout change", () => {
    const { rerender } = render(<MapViewportProvider value={{ top: 120, right: 300, bottom: 0, left: 0 }}><CurrentLocation /></MapViewportProvider>);
    fireEvent.click(screen.getByRole("button", { name: "현재 위치" }));
    update(NOW);
    expect(maps.map.panBy).toHaveBeenLastCalledWith(150, -60);
    rerender(<MapViewportProvider value={{ top: 80, right: 0, bottom: 0, left: 0 }}><CurrentLocation /></MapViewportProvider>);
    expect(maps.map.panTo).toHaveBeenCalledTimes(1);
  });

  it("does not prompt on mount, recenters only once, and makes no app request or persistent storage write", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const indexedDB = { open: vi.fn() };
    vi.stubGlobal("indexedDB", indexedDB);
    const { unmount } = render(<StrictMode><CurrentLocation /></StrictMode>);
    expect(watchPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "현재 위치" }));
    expect(screen.getByRole("button", { name: "현재 위치" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("확인하고 있습니다");
    update(NOW);
    expect(screen.getByRole("img", { name: "내 현재 위치" })).toBeInTheDocument();
    expect(maps.circle).toHaveBeenLastCalledWith(expect.objectContaining({ radius: 15, clickable: false }));
    expect(maps.map.panTo).toHaveBeenCalledTimes(1);
    expect(maps.map.setZoom).toHaveBeenLastCalledWith(16);
    update(NOW + 1);
    expect(maps.map.panTo).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(indexedDB.open).not.toHaveBeenCalled();
    unmount();
    expect(clearWatch).toHaveBeenCalledWith(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("labels a low-accuracy estimate and retains a distinguishable stale marker", () => {
    render(<CurrentLocation />);
    fireEvent.click(screen.getByRole("button", { name: "현재 위치" }));
    update(NOW, 2_000);
    expect(screen.getByRole("status")).toHaveTextContent("대략적인 현재 위치");
    expect(screen.getByText(/2.0km/)).toBeInTheDocument();
    expect(maps.map.setZoom).toHaveBeenLastCalledWith(12);
    act(() => vi.advanceTimersByTime(31_000));
    expect(screen.getByRole("status")).toHaveTextContent("갱신이 지연");
    expect(screen.getByRole("img", { name: "마지막으로 확인한 내 위치" })).toHaveClass("is-stale");
  });

  it("shows actionable denial guidance without blocking a retry", () => {
    render(<CurrentLocation />);
    fireEvent.click(screen.getByRole("button", { name: "현재 위치" }));
    act(() => error({ code: 1 } as GeolocationPositionError));
    expect(screen.getByRole("status")).toHaveTextContent("사이트 설정");
    expect(screen.getByRole("button", { name: "현재 위치" })).toBeEnabled();
    expect(maps.map.panTo).not.toHaveBeenCalled();
  });

  it("does not undo recentering on a metadata-only itinerary refresh", () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "synthetic-test-key");
    const spot = { id: "one", name: "One", lat: 37, lng: 127, order: 0 };
    const props = { spots: [spot] as React.ComponentProps<typeof TripMap>["spots"], selection: { kind: "spot" as const, spotId: "one" }, date: "2026-09-07", timezone: "Asia/Seoul", onSelect: vi.fn() };
    const { rerender } = render(<TripMap {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "현재 위치" }));
    update(NOW);
    const centers = maps.map.setCenter.mock.calls.length;
    const pans = maps.map.panTo.mock.calls.length;
    rerender(<TripMap {...props} selection={{ ...props.selection }} spots={[{ ...spot, name: "Updated name" }] as React.ComponentProps<typeof TripMap>["spots"]} />);
    expect(maps.map.setCenter).toHaveBeenCalledTimes(centers);
    expect(maps.map.panTo).toHaveBeenCalledTimes(pans);
  });

  it.each(["FAILED", "AUTH_FAILURE"])("does not acquire location when map loading fails (%s)", (status) => {
    maps.status = status;
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "synthetic-test-key");
    render(<TripMap spots={[]} selection={null} date="2026-09-07" timezone="Asia/Seoul" onSelect={vi.fn()} />);
    expect(screen.getByText("지도를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "현재 위치" })).not.toBeInTheDocument();
    expect(watchPosition).not.toHaveBeenCalled();
  });
});
