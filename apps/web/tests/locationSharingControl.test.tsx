import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocationSharingControl } from "../src/components/LocationSharingControl";
import { useTripLocationSharing, type SharedLocationWithName } from "../src/hooks/useTripLocationSharing";
import { TooltipProvider } from "../src/components/ui/tooltip";

const api = vi.hoisted(() => ({
  getLocationSharing: vi.fn(),
  getLocationSharingConsent: vi.fn(),
  startLocationSharing: vi.fn(),
  stopLocationSharing: vi.fn(),
  updateLocationSharing: vi.fn(),
}));
const device = vi.hoisted(() => ({
  fix: null as { lat: number; lng: number; accuracy: number; timestamp: number } | null,
  phase: "idle" as "idle" | "ready" | "paused",
  requestLocation: vi.fn(),
}));

vi.mock("../src/api", () => api);
vi.mock("../src/hooks/useDeviceLocation", () => ({ useDeviceLocation: () => device }));

const NOW = 1_800_000_000_000;
const consent = {
  consentToken: "not-a-real-token",
  consentExpiresAt: NOW + 600_000,
  audienceVersion: "audience-v1",
  recipients: [{ id: "other", name: "동행자" }],
  durationOptions: [900, 3600],
  defaultDurationSeconds: 3600,
  viewersNeedNotShare: true,
};

const ignoreLocations = (_locations: SharedLocationWithName[]) => undefined;
const ignoreFocus = (_userId: string | null) => undefined;

function SharingHarness({ panel = true, onLocationsChange = ignoreLocations }: {
  panel?: boolean;
  onLocationsChange?: (locations: SharedLocationWithName[]) => void;
}) {
  const controller = useTripLocationSharing({ tripId: "trip-1", onLocationsChange, onFocus: ignoreFocus });
  return <TooltipProvider delayDuration={0}>
    {panel && <LocationSharingControl controller={controller} />}
  </TooltipProvider>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  device.fix = null;
  device.phase = "idle";
  device.requestLocation.mockReset();
  api.getLocationSharing.mockReset().mockResolvedValue({
    serverTime: NOW,
    recipients: [],
    locations: [],
    ownSharing: null,
  });
  api.getLocationSharingConsent.mockReset().mockResolvedValue(consent);
  api.startLocationSharing.mockReset().mockResolvedValue({ sharingSessionId: "session-1", expiresAt: NOW + 3_600_000 });
  api.stopLocationSharing.mockReset().mockResolvedValue({ stopped: true });
  api.updateLocationSharing.mockReset().mockResolvedValue({ expiresAt: NOW + 60_000 });
});

describe("trip location sharing experience", () => {
  it("polls while the trip is open but waits for explicit consent before requesting device location", async () => {
    render(<SharingHarness />);
    act(() => vi.advanceTimersByTime(0));
    await act(async () => undefined);
    expect(api.getLocationSharing).toHaveBeenCalledWith("trip-1");
    expect(device.requestLocation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    await act(async () => undefined);
    expect(screen.getByRole("dialog", { name: "위치 공유 확인" })).toHaveTextContent("동행자");
    expect(device.requestLocation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "공유 시작" }));
    await act(async () => undefined);
    expect(api.startLocationSharing).toHaveBeenCalledWith("trip-1", expect.objectContaining({
      consentToken: "not-a-real-token",
      durationSeconds: 3600,
      takeover: false,
    }));
    expect(device.requestLocation).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/공유 준비 중.*1시간 남음/)).toBeInTheDocument();
  });

  it("keeps an active session when the participant panel closes", async () => {
    const { rerender, unmount } = render(<SharingHarness />);
    act(() => vi.advanceTimersByTime(0));
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "공유 시작" }));
    await act(async () => undefined);

    rerender(<SharingHarness panel={false} />);
    expect(api.stopLocationSharing).not.toHaveBeenCalled();

    unmount();
    expect(api.stopLocationSharing).toHaveBeenCalledWith("trip-1", "session-1");
  });

  it("expires participant markers locally even when later polling fails", async () => {
    const onLocationsChange = vi.fn();
    api.getLocationSharing.mockResolvedValueOnce({
      serverTime: NOW,
      recipients: [{ id: "other", name: "동행자" }],
      locations: [{
        userId: "other",
        lat: 37.5,
        lng: 127,
        accuracy: 12,
        measuredAt: NOW,
        receivedAt: NOW,
        expiresAt: NOW + 2_000,
        sharingExpiresAt: NOW + 3_600_000,
      }],
      ownSharing: null,
    }).mockRejectedValue(new Error("offline"));
    render(<SharingHarness onLocationsChange={onLocationsChange} />);
    act(() => vi.advanceTimersByTime(0));
    await act(async () => undefined);
    expect(onLocationsChange).toHaveBeenLastCalledWith([expect.objectContaining({ userId: "other", name: "동행자" })]);

    act(() => vi.advanceTimersByTime(3_000));
    expect(onLocationsChange).toHaveBeenLastCalledWith([]);
  });

  it("requires an explicit takeover confirmation for a session from another tab or device", async () => {
    api.getLocationSharing.mockResolvedValue({
      serverTime: NOW,
      recipients: [],
      locations: [],
      ownSharing: { tripId: "trip-1", expiresAt: NOW + 900_000, sameLoginSession: true },
    });
    render(<SharingHarness />);
    act(() => vi.advanceTimersByTime(0));
    await act(async () => undefined);
    expect(screen.getByText(/다른 탭이나 기기에서 공유 중/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "이 기기에서 계속" }));
    await act(async () => undefined);
    const takeover = screen.getByRole("checkbox", { name: /기존 공유를 종료/ });
    expect(takeover).not.toBeChecked();
    expect(screen.getByRole("button", { name: "공유 시작" })).toBeDisabled();
    fireEvent.click(takeover);
    fireEvent.click(screen.getByRole("button", { name: "공유 시작" }));
    await act(async () => undefined);
    expect(api.startLocationSharing).toHaveBeenCalledWith("trip-1", expect.objectContaining({ takeover: true }));
  });

  it("throttles rapid GPS fixes to the server's two-second update contract", async () => {
    const { rerender } = render(<SharingHarness />);
    act(() => vi.advanceTimersByTime(0));
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "공유 시작" }));
    await act(async () => undefined);

    device.phase = "ready";
    device.fix = { lat: 37.5, lng: 127, accuracy: 12, timestamp: NOW + 1 };
    rerender(<SharingHarness />);
    await act(async () => undefined);
    expect(api.updateLocationSharing).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/위치 공유 중.*1시간 남음/)).toBeInTheDocument();

    vi.setSystemTime(NOW + 1_000);
    device.fix = { ...device.fix, timestamp: NOW + 1_000 };
    rerender(<SharingHarness />);
    await act(async () => undefined);
    expect(api.updateLocationSharing).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW + 2_100);
    device.fix = { ...device.fix, timestamp: NOW + 2_100 };
    rerender(<SharingHarness />);
    await act(async () => undefined);
    expect(api.updateLocationSharing).toHaveBeenCalledTimes(2);
  });
});
