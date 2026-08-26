export const LOCATION_STALE_AFTER_MS = 30_000;
export const LOCATION_REQUEST_TIMEOUT_MS = 15_000;
export const LOW_ACCURACY_METERS = 100;

export type DeviceFix = { lat: number; lng: number; accuracy: number; timestamp: number };
export type LocationPhase = "idle" | "acquiring" | "ready" | "stale" | "paused" | "denied" | "unavailable" | "timeout" | "unsupported" | "insecure";
export type DeviceLocationState = {
  phase: LocationPhase;
  fix: DeviceFix | null;
  // Only an explicit request produces this value. Ordinary watch updates must
  // never move the camera after the person starts exploring the map.
  requestedFix: DeviceFix | null;
};

const INITIAL_STATE: DeviceLocationState = { phase: "idle", fix: null, requestedFix: null };

export function validDeviceFix(position: GeolocationPosition, now: number, previous: DeviceFix | null): DeviceFix | null {
  const { latitude: lat, longitude: lng, accuracy } = position.coords;
  const timestamp = position.timestamp;
  if (![lat, lng, accuracy, timestamp].every(Number.isFinite)
    || Math.abs(lat) > 90 || Math.abs(lng) > 180 || accuracy < 0
    || timestamp <= 0 || timestamp > now + 5_000
    || now - timestamp > LOCATION_STALE_AFTER_MS
    || (previous !== null && timestamp <= previous.timestamp)) return null;
  return { lat, lng, accuracy, timestamp };
}

// An ephemeral, shared browser subscription. Coordinates never enter the query
// cache, storage, trip model, logs, or application requests. Future personal
// following/sharing consumers can reuse it without creating another GPS watch.
export function createDeviceLocationSource() {
  let state = INITIAL_STATE;
  const listeners = new Set<() => void>();
  let activeWatch: { geolocation: Geolocation; id: number } | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let generation = 0;
  let deadline = 0;
  let awaitingFix = false;

  const emit = (next: DeviceLocationState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const stopWatch = () => {
    generation += 1;
    if (activeWatch) activeWatch.geolocation.clearWatch(activeWatch.id);
    activeWatch = null;
    if (interval !== null) clearInterval(interval);
    interval = null;
    awaitingFix = false;
  };
  const fail = (phase: LocationPhase) => {
    stopWatch();
    emit({ ...state, phase, requestedFix: null });
  };
  const onVisibilityChange = () => {
    if (document.visibilityState !== "hidden" || (!activeWatch && !awaitingFix)) return;
    stopWatch();
    emit({ ...state, phase: "paused", requestedFix: null });
    // Returning to a page does not silently restart location acquisition.
    // The visible control explains how to resume with an explicit action.
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1 && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size !== 0) return;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
      stopWatch();
      state = INITIAL_STATE;
    };
  };

  const request = () => {
    if (listeners.size === 0) return;
    stopWatch();
    if (typeof window === "undefined" || !window.isSecureContext) return fail("insecure");
    if (!navigator.geolocation) return fail("unsupported");
    if (document.visibilityState === "hidden") return fail("paused");
    const geolocation = navigator.geolocation;
    const currentGeneration = generation;
    awaitingFix = true;
    deadline = Date.now() + LOCATION_REQUEST_TIMEOUT_MS;
    emit({ ...state, phase: "acquiring", requestedFix: null });
    if (generation !== currentGeneration || listeners.size === 0) return;
    interval = setInterval(() => {
      if (awaitingFix && Date.now() >= deadline) return fail("timeout");
      if (state.phase === "ready" && state.fix && Date.now() - state.fix.timestamp > LOCATION_STALE_AFTER_MS) {
        emit({ ...state, phase: "stale" });
      }
    }, 1_000);
    try {
      const id = geolocation.watchPosition((position) => {
        if (generation !== currentGeneration || listeners.size === 0) return;
        const fix = validDeviceFix(position, Date.now(), state.fix);
        if (!fix) return;
        const requestedFix = awaitingFix ? fix : state.requestedFix;
        awaitingFix = false;
        emit({ phase: "ready", fix, requestedFix });
      }, (error) => {
        if (generation !== currentGeneration || listeners.size === 0) return;
        fail(error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable");
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: LOCATION_REQUEST_TIMEOUT_MS });
      if (generation !== currentGeneration) geolocation.clearWatch(id);
      else activeWatch = { geolocation, id };
    } catch {
      fail("unavailable");
    }
  };

  return { subscribe, getSnapshot: () => state, getServerSnapshot: () => INITIAL_STATE, request };
}

export const deviceLocationSource = createDeviceLocationSource();
