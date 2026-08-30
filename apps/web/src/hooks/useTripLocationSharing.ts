import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLocationSharing,
  getLocationSharingConsent,
  startLocationSharing,
  stopLocationSharing,
  updateLocationSharing,
  type LocationSharingConsent,
  type LocationSharingPoll,
  type SharedLocation,
} from "../api";
import { useDeviceLocation } from "./useDeviceLocation";

export type SharedLocationWithName = SharedLocation & { name: string | null };

type LocalSharedLocation = SharedLocationWithName & { clientExpiresAt: number };

const POLL_INTERVAL_MS = 5_000;
const MINIMUM_UPDATE_INTERVAL_MS = 2_000;

const ERROR_MESSAGES: Record<string, string> = {
  "location sharing is unavailable": "위치 공유는 안전한 운영 설정이 준비되면 사용할 수 있습니다.",
  "sharing session ended": "위치 공유가 종료되었습니다.",
  "login required": "로그인이 만료되어 위치 공유가 종료되었습니다.",
  "account pending admin approval": "관리자 승인 후 위치를 공유할 수 있습니다.",
  "recipient confirmation expired or changed": "참여자 구성이 바뀌었습니다. 공유 대상을 다시 확인해주세요.",
  "sharing already active; explicit takeover required": "다른 탭이나 기기에서 위치를 공유하고 있습니다.",
  "too many location requests": "위치 요청이 잠시 제한되었습니다. 잠시 후 자동으로 다시 시도합니다.",
  "location updates must be at least two seconds apart": "위치 갱신 간격을 조정하고 있습니다.",
  "stale or invalid measurement time": "새 위치를 확인한 뒤 다시 공유합니다.",
};

function errorMessage(reason: unknown) {
  const code = reason instanceof Error ? reason.message : String(reason);
  return ERROR_MESSAGES[code] ?? "위치 공유 요청을 처리하지 못했습니다. 연결을 확인한 뒤 다시 시도해주세요.";
}

function remainingText(expiresAt: number | null, now: number) {
  if (!expiresAt) return "종료 시간 확인 중";
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1_000));
  if (seconds === 0) return "종료 중";
  if (seconds < 60) return "1분 미만 남음";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}분 남음`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분 남음` : `${hours}시간 남음`;
}

function withoutClientExpiry(location: LocalSharedLocation): SharedLocationWithName {
  const { clientExpiresAt: _clientExpiresAt, ...shared } = location;
  return shared;
}

export type TripLocationSharingController = ReturnType<typeof useTripLocationSharing>;

export function useTripLocationSharing({
  tripId,
  onLocationsChange,
  onFocus,
}: {
  tripId: string;
  onLocationsChange: (locations: SharedLocationWithName[]) => void;
  onFocus: (userId: string | null) => void;
}) {
  const { fix, phase, requestLocation } = useDeviceLocation();
  const [consent, setConsent] = useState<LocationSharingConsent | null>(null);
  const [duration, setDuration] = useState(3_600);
  const [sharingSessionId, setSharingSessionId] = useState<string | null>(null);
  const [ownSharing, setOwnSharing] = useState<LocationSharingPoll["ownSharing"]>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [takeover, setTakeover] = useState(false);
  const [positionPublished, setPositionPublished] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const sessionRef = useRef<string | null>(null);
  const locationsRef = useRef<LocalSharedLocation[]>([]);
  const pollRunning = useRef(false);
  const lastSentFix = useRef(0);
  const lastSentRequestAt = useRef(0);

  const clearLocalSession = useCallback((message?: string) => {
    sessionRef.current = null;
    setSharingSessionId(null);
    setExpiresAt(null);
    setPositionPublished(false);
    if (message) setErrorCode(message);
  }, []);

  const publishLocations = useCallback((locations: LocalSharedLocation[]) => {
    locationsRef.current = locations;
    onLocationsChange(locations.map(withoutClientExpiry));
  }, [onLocationsChange]);

  const applyPoll = useCallback((next: LocationSharingPoll, sessionAtRequest: string | null) => {
    const receivedAt = Date.now();
    const names = new Map(next.recipients.map((recipient) => [recipient.id, recipient.name]));
    publishLocations(next.locations
      .map((location) => ({
        ...location,
        name: names.get(location.userId) ?? null,
        clientExpiresAt: receivedAt + Math.max(0, location.expiresAt - next.serverTime),
      }))
      .filter((location) => location.clientExpiresAt > receivedAt));
    setOwnSharing(next.ownSharing);
    if (sessionAtRequest && sessionRef.current === sessionAtRequest && !next.ownSharing) clearLocalSession("sharing session ended");
    else if (sessionRef.current && next.ownSharing) setExpiresAt(next.ownSharing.expiresAt);
  }, [clearLocalSession, publishLocations]);

  const poll = useCallback(async () => {
    if (unavailable || pollRunning.current || document.visibilityState === "hidden") return;
    pollRunning.current = true;
    const sessionAtRequest = sessionRef.current;
    try {
      const next = await getLocationSharing(tripId);
      applyPoll(next, sessionAtRequest);
      setErrorCode((current) => current && [
        "sharing session ended",
        "login required",
        "recipient confirmation expired or changed",
        "sharing already active; explicit takeover required",
      ].includes(current) ? current : null);
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : String(reason);
      if (code === "location sharing is unavailable") setUnavailable(true);
      else setErrorCode(code);
    } finally {
      pollRunning.current = false;
    }
  }, [applyPoll, tripId, unavailable]);

  useEffect(() => {
    sessionRef.current = sharingSessionId;
  }, [sharingSessionId]);

  useEffect(() => {
    const initialPoll = window.setTimeout(() => void poll(), 0);
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(initialPoll);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [poll]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = Date.now();
      if (sessionRef.current || ownSharing) setNow(current);
      const fresh = locationsRef.current.filter((location) => location.clientExpiresAt > current);
      if (fresh.length !== locationsRef.current.length) publishLocations(fresh);
      if (sessionRef.current && expiresAt !== null && expiresAt <= current) {
        setOwnSharing(null);
        clearLocalSession("sharing session ended");
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [clearLocalSession, expiresAt, ownSharing, publishLocations]);

  useEffect(() => () => {
    const session = sessionRef.current;
    if (session) void stopLocationSharing(tripId, session).catch(() => undefined);
  }, [tripId]);

  useEffect(() => {
    if (!sharingSessionId || !fix || phase !== "ready" || fix.timestamp <= lastSentFix.current) return;
    const requestedAt = Date.now();
    if (requestedAt - lastSentRequestAt.current < MINIMUM_UPDATE_INTERVAL_MS) return;
    lastSentFix.current = fix.timestamp;
    lastSentRequestAt.current = requestedAt;
    void updateLocationSharing(tripId, {
      sharingSessionId,
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy,
      measuredAt: fix.timestamp,
    }).then((response) => {
      setExpiresAt((current) => current ?? response.expiresAt);
      setPositionPublished(true);
      setErrorCode(null);
    }).catch((reason) => {
      const code = reason instanceof Error ? reason.message : String(reason);
      if (code === "sharing session ended" || code === "login required") {
        setOwnSharing(null);
        clearLocalSession(code);
      } else {
        setErrorCode(code);
      }
    });
  }, [clearLocalSession, fix, phase, sharingSessionId, tripId]);

  async function requestConsent() {
    setPending(true);
    setErrorCode(null);
    try {
      const next = await getLocationSharingConsent(tripId);
      setConsent(next);
      setDuration(next.defaultDurationSeconds);
      setTakeover(false);
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : String(reason);
      if (code === "location sharing is unavailable") setUnavailable(true);
      setErrorCode(code);
    } finally {
      setPending(false);
    }
  }

  async function beginSharing() {
    if (!consent) return;
    setPending(true);
    setErrorCode(null);
    try {
      const started = await startLocationSharing(tripId, {
        consentToken: consent.consentToken,
        audienceVersion: consent.audienceVersion,
        durationSeconds: duration,
        takeover,
      });
      sessionRef.current = started.sharingSessionId;
      setSharingSessionId(started.sharingSessionId);
      setOwnSharing({ tripId, expiresAt: started.expiresAt, sameLoginSession: true });
      setExpiresAt(started.expiresAt);
      setConsent(null);
      setPositionPublished(false);
      lastSentFix.current = 0;
      lastSentRequestAt.current = 0;
      requestLocation();
    } catch (reason) {
      setErrorCode(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  }

  async function stopSharing() {
    const session = sessionRef.current;
    if (!session) return;
    setPending(true);
    setErrorCode(null);
    try {
      await stopLocationSharing(tripId, session);
      setOwnSharing(null);
      clearLocalSession();
      onFocus(null);
      await poll();
    } catch (reason) {
      setErrorCode(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  }

  const localActive = Boolean(sharingSessionId);
  const remoteActive = Boolean(ownSharing && !sharingSessionId);
  const remoteOnOtherTrip = Boolean(remoteActive && ownSharing?.tripId !== tripId);
  const remaining = remainingText(expiresAt ?? ownSharing?.expiresAt ?? null, now);
  const starting = localActive && !positionPublished && ["idle", "acquiring"].includes(phase);
  const interrupted = localActive && !starting && (!positionPublished || phase !== "ready");
  const active = localActive && positionPublished && phase === "ready";
  const takeoverRequired = remoteActive || errorCode === "sharing already active; explicit takeover required";

  return {
    consent,
    duration,
    setDuration,
    takeover,
    setTakeover,
    localActive,
    remoteActive,
    remoteOnOtherTrip,
    active,
    starting,
    interrupted,
    remaining,
    unavailable,
    pending,
    errorCode,
    error: errorCode ? errorMessage(new Error(errorCode)) : null,
    takeoverRequired,
    locationPhase: phase,
    requestLocation,
    requestConsent,
    beginSharing,
    stopSharing,
    cancelConsent: () => {
      setConsent(null);
      setErrorCode(null);
      setTakeover(false);
    },
  };
}
