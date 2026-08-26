import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocationSharingControl } from "../src/components/LocationSharingControl";

const api = vi.hoisted(() => ({
  getLocationSharing: vi.fn(),
  getLocationSharingConsent: vi.fn(),
  startLocationSharing: vi.fn(),
  stopLocationSharing: vi.fn(),
  updateLocationSharing: vi.fn(),
}));
const device = vi.hoisted(() => ({
  fix: null as { lat: number; lng: number; accuracy: number; timestamp: number } | null,
  phase: "idle" as "idle" | "ready",
  requestLocation: vi.fn(),
}));

vi.mock("../src/api", () => api);
vi.mock("../src/hooks/useDeviceLocation", () => ({ useDeviceLocation: () => device }));

const consent = {
  consentToken: "not-a-real-token",
  consentExpiresAt: 1_800_000_600_000,
  audienceVersion: "audience-v1",
  recipients: [{ id: "other", name: "동행자" }],
  durationOptions: [900, 3600],
  defaultDurationSeconds: 3600,
  viewersNeedNotShare: true,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  device.fix = null;
  device.phase = "idle";
  device.requestLocation.mockReset();
  api.getLocationSharing.mockResolvedValue({
    serverTime: 1,
    recipients: [],
    locations: [],
    ownSharing: { tripId: "trip-1", expiresAt: 1_800_003_600_000, sameLoginSession: true },
  });
  api.getLocationSharingConsent.mockResolvedValue(consent);
  api.startLocationSharing.mockResolvedValue({ sharingSessionId: "session-1", expiresAt: 1_800_003_600_000 });
  api.stopLocationSharing.mockResolvedValue({ stopped: true });
  api.updateLocationSharing.mockResolvedValue({ expiresAt: 1_800_003_600_000 });
});

describe("location sharing consent", () => {
  it("does not request device location until the consent dialog is confirmed", async () => {
    const onLocationsChange = vi.fn();
    render(<LocationSharingControl tripId="trip-1" open={false} onLocationsChange={onLocationsChange} onFocus={vi.fn()} />);
    expect(api.getLocationSharing).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    await act(async () => undefined);
    expect(api.getLocationSharingConsent).toHaveBeenCalledWith("trip-1");
    expect(screen.getByRole("dialog", { name: "위치 공유 확인" })).toHaveTextContent("동행자");
    expect(device.requestLocation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "공유 시작" }));
    await act(async () => undefined);
    expect(api.startLocationSharing).toHaveBeenCalledWith("trip-1", expect.objectContaining({ consentToken: "not-a-real-token", durationSeconds: 3600 }));
    expect(device.requestLocation).toHaveBeenCalledTimes(1);
  });

  it("posts a fresh location only while an explicit sharing session exists and closes it on departure", async () => {
    const onLocationsChange = vi.fn();
    const onFocus = vi.fn();
    const { rerender, unmount } = render(<LocationSharingControl tripId="trip-1" open={false} onLocationsChange={onLocationsChange} onFocus={onFocus} />);
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "공유 시작" }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/공유 중/)).toBeInTheDocument();
    device.phase = "ready";
    device.fix = { lat: 37.5, lng: 127, accuracy: 12, timestamp: 1_800_000_001_000 };
    rerender(<LocationSharingControl tripId="trip-1" open={false} onLocationsChange={onLocationsChange} onFocus={onFocus} />);
    await act(async () => { await Promise.resolve(); });
    expect(api.updateLocationSharing).toHaveBeenCalledWith("trip-1", expect.objectContaining({ sharingSessionId: "session-1", lat: 37.5, lng: 127 }));
    unmount();
    expect(api.stopLocationSharing).toHaveBeenCalledWith("trip-1", "session-1");
  });
});
