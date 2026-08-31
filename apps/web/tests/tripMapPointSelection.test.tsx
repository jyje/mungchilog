import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TripMap } from "../src/components/TripMap";

vi.mock("@vis.gl/react-google-maps", () => ({
  APILoadingStatus: { LOADED: "LOADED", FAILED: "FAILED", AUTH_FAILURE: "AUTH_FAILURE" },
  useApiLoadingStatus: () => "LOADED",
  useMap: () => null,
  Map: ({ children, onClick, onContextmenu }: {
    children: React.ReactNode;
    onClick?: (event: { detail: { latLng: { lat: number; lng: number } } }) => void;
    onContextmenu?: (event: { detail: { latLng: { lat: number; lng: number } } }) => void;
  }) => (
    <div
      data-testid="google-map"
      onClick={() => onClick?.({ detail: { latLng: { lat: 37.5, lng: 127 } } })}
      onContextMenu={() => onContextmenu?.({ detail: { latLng: { lat: 37.5, lng: 127 } } })}
    >
      {children}
    </div>
  ),
  AdvancedMarker: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Pin: () => null,
}));

vi.mock("../src/components/RouteOverlay", () => ({ RouteOverlay: () => null }));
vi.mock("../src/components/CurrentLocation", () => ({ CurrentLocation: () => null, CurrentLocationControl: () => null }));
vi.mock("../src/components/ItineraryFollowControl", () => ({ ItineraryFollowControl: () => null }));
vi.mock("../src/components/MapViewportContext", () => ({ useMapViewportInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock("../src/components/system/MapControlRail", () => ({ MapControlRail: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

beforeEach(() => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
});

function map(onPickPoint: (point: { lat: number; lng: number }) => void, pointPickActive = false) {
  return render(
    <TripMap
      spots={[]}
      date="2026-08-31"
      timezone="Asia/Seoul"
      legPreferences={[]}
      selection={null}
      onSelect={vi.fn()}
      pointPickActive={pointPickActive}
      onPickPoint={onPickPoint}
    />,
  );
}

describe("map coordinate selection", () => {
  it("adds the context-menu coordinate only after explicit confirmation", async () => {
    const onPickPoint = vi.fn();
    map(onPickPoint);

    fireEvent.contextMenu(screen.getByTestId("google-map"));
    const action = await screen.findByRole("menuitem", { name: "이 위치를 일정에 추가" });
    expect(onPickPoint).not.toHaveBeenCalled();
    fireEvent.click(action);

    expect(onPickPoint).toHaveBeenCalledWith({ lat: 37.5, lng: 127 });
  });

  it("uses the next map click while explicit point-pick mode is active", () => {
    const onPickPoint = vi.fn();
    map(onPickPoint, true);

    expect(screen.getByRole("status")).toHaveTextContent("일정에 추가할 위치");
    fireEvent.click(screen.getByTestId("google-map"));

    expect(onPickPoint).toHaveBeenCalledWith({ lat: 37.5, lng: 127 });
  });
});
