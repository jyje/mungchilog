import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeviceLocationSource, LOCATION_REQUEST_TIMEOUT_MS, LOCATION_STALE_AFTER_MS, validDeviceFix } from "../src/location/deviceLocation";

const NOW = 1_800_000_000_000;
function position(overrides: Partial<{ latitude: number; longitude: number; accuracy: number; timestamp: number }> = {}): GeolocationPosition {
  const { timestamp = Date.now(), ...coords } = overrides;
  return { coords: { latitude: 37.5, longitude: 127, accuracy: 15, ...coords }, timestamp } as GeolocationPosition;
}

function mockGeolocation() {
  const callbacks: { success: PositionCallback; error: PositionErrorCallback }[] = [];
  const watchPosition = vi.fn((success: PositionCallback, error: PositionErrorCallback) => {
    callbacks.push({ success, error });
    return callbacks.length;
  });
  const clearWatch = vi.fn();
  vi.stubGlobal("navigator", { geolocation: { watchPosition, clearWatch } });
  return { callbacks, watchPosition, clearWatch };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("isSecureContext", true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});

describe("device location subscription", () => {
  it("does not prompt on subscribe, shares one watch, and discards coordinates after the last consumer leaves", () => {
    const geo = mockGeolocation();
    const source = createDeviceLocationSource();
    const leaveFirst = source.subscribe(vi.fn());
    const leaveSecond = source.subscribe(vi.fn());
    expect(geo.watchPosition).not.toHaveBeenCalled();
    source.request();
    geo.callbacks[0].success(position());
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(source.getSnapshot().phase).toBe("ready");
    leaveFirst();
    expect(geo.clearWatch).not.toHaveBeenCalled();
    leaveSecond();
    expect(geo.clearWatch).toHaveBeenCalledWith(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(source.getSnapshot()).toEqual({ phase: "idle", fix: null, requestedFix: null });
    geo.callbacks[0].success(position({ timestamp: NOW + 1 }));
    expect(source.getSnapshot().fix).toBeNull();
  });

  it("produces one camera request per explicit action and ignores a cancelled watch callback", () => {
    const geo = mockGeolocation();
    const source = createDeviceLocationSource();
    const leave = source.subscribe(vi.fn());
    source.request();
    geo.callbacks[0].success(position());
    const requested = source.getSnapshot().requestedFix;
    geo.callbacks[0].success(position({ latitude: 37.6, timestamp: NOW + 1 }));
    expect(source.getSnapshot().fix?.lat).toBe(37.6);
    expect(source.getSnapshot().requestedFix).toBe(requested);
    source.request();
    expect(geo.clearWatch).toHaveBeenCalledWith(1);
    geo.callbacks[0].success(position({ latitude: 38, timestamp: NOW + 2 }));
    expect(source.getSnapshot().phase).toBe("acquiring");
    geo.callbacks[1].success(position({ latitude: 37.7, timestamp: NOW + 2 }));
    expect(source.getSnapshot().requestedFix?.lat).toBe(37.7);
    leave();
  });

  it.each([[1, "denied"], [2, "unavailable"], [3, "timeout"]] as const)("reports error %i, clears the watch, and allows explicit retry", (code, phase) => {
    const geo = mockGeolocation();
    const source = createDeviceLocationSource();
    const leave = source.subscribe(vi.fn());
    source.request();
    geo.callbacks[0].error({ code } as GeolocationPositionError);
    expect(source.getSnapshot().phase).toBe(phase);
    expect(geo.clearWatch).toHaveBeenCalledWith(1);
    expect(vi.getTimerCount()).toBe(0);
    source.request();
    geo.callbacks[1].success(position());
    expect(source.getSnapshot().phase).toBe("ready");
    leave();
  });

  it("times out even when no usable callback is received", () => {
    const geo = mockGeolocation();
    const source = createDeviceLocationSource();
    const leave = source.subscribe(vi.fn());
    source.request();
    geo.callbacks[0].success(position({ timestamp: NOW - 60_000 }));
    vi.advanceTimersByTime(LOCATION_REQUEST_TIMEOUT_MS);
    expect(source.getSnapshot().phase).toBe("timeout");
    expect(source.getSnapshot().fix).toBeNull();
    leave();
  });

  it("marks stale fixes with their original timestamp and recovers without another camera request", () => {
    const geo = mockGeolocation();
    const source = createDeviceLocationSource();
    const leave = source.subscribe(vi.fn());
    source.request();
    geo.callbacks[0].success(position());
    const requested = source.getSnapshot().requestedFix;
    vi.advanceTimersByTime(LOCATION_STALE_AFTER_MS + 1_000);
    expect(source.getSnapshot().phase).toBe("stale");
    expect(source.getSnapshot().fix?.timestamp).toBe(NOW);
    geo.callbacks[0].success(position());
    expect(source.getSnapshot().phase).toBe("ready");
    expect(source.getSnapshot().requestedFix).toBe(requested);
    leave();
  });

  it("suspends acquisition while hidden and requires an explicit visible resume", () => {
    const geo = mockGeolocation();
    const source = createDeviceLocationSource();
    const leave = source.subscribe(vi.fn());
    source.request();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(source.getSnapshot().phase).toBe("paused");
    expect(geo.clearWatch).toHaveBeenCalledWith(1);
    expect(vi.getTimerCount()).toBe(0);
    geo.callbacks[0].success(position());
    expect(source.getSnapshot().fix).toBeNull();
    source.request();
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    source.request();
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
    leave();
  });

  it("does not call geolocation in an insecure context or unsupported browser", () => {
    const geo = mockGeolocation();
    const source = createDeviceLocationSource();
    const leave = source.subscribe(vi.fn());
    vi.stubGlobal("isSecureContext", false);
    source.request();
    expect(source.getSnapshot().phase).toBe("insecure");
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", {});
    source.request();
    expect(source.getSnapshot().phase).toBe("unsupported");
    expect(geo.watchPosition).not.toHaveBeenCalled();
    leave();
  });

  it("clears a watch even if the browser synchronously invokes its error callback", () => {
    const geo = mockGeolocation();
    geo.watchPosition.mockImplementation((_success, error) => { error({ code: 1 } as GeolocationPositionError); return 5; });
    const source = createDeviceLocationSource();
    const leave = source.subscribe(vi.fn());
    source.request();
    expect(source.getSnapshot().phase).toBe("denied");
    expect(geo.clearWatch).toHaveBeenCalledWith(5);
    expect(vi.getTimerCount()).toBe(0);
    leave();
  });
});

describe("fix validation", () => {
  it.each([
    { latitude: 91 }, { latitude: NaN }, { longitude: -181 }, { accuracy: -1 }, { accuracy: Infinity },
    { timestamp: 0 }, { timestamp: NOW + 5_001 }, { timestamp: NOW - LOCATION_STALE_AFTER_MS - 1 },
  ])("rejects invalid coordinates or timestamps: %j", (invalid) => {
    expect(validDeviceFix(position(invalid), NOW, null)).toBeNull();
  });

  it("rejects out-of-order and repeated fixes but accepts a broad valid estimate", () => {
    const previous = validDeviceFix(position(), NOW, null)!;
    expect(validDeviceFix(position({ timestamp: NOW - 1 }), NOW, previous)).toBeNull();
    expect(validDeviceFix(position(), NOW, previous)).toBeNull();
    expect(validDeviceFix(position({ accuracy: 12_000, timestamp: NOW + 1 }), NOW, previous)?.accuracy).toBe(12_000);
  });
});
