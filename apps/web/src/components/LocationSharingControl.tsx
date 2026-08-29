import { useEffect, useRef, useState } from "react";
import { getLocationSharing, getLocationSharingConsent, startLocationSharing, stopLocationSharing, updateLocationSharing, type LocationSharingConsent, type SharedLocation } from "../api";
import { useDeviceLocation } from "../hooks/useDeviceLocation";
import { Button } from "./ui/button";

export type SharedLocationWithName = SharedLocation & { name: string | null };

export function LocationSharingControl({ tripId, open, onLocationsChange, onFocus }: {
  tripId: string;
  open: boolean;
  onLocationsChange: (locations: SharedLocationWithName[]) => void;
  onFocus: (userId: string | null) => void;
}) {
  const { fix, phase, requestLocation } = useDeviceLocation();
  const [consent, setConsent] = useState<LocationSharingConsent | null>(null);
  const [duration, setDuration] = useState(3600);
  const [sharingSessionId, setSharingSessionId] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [takeover, setTakeover] = useState(false);
  const lastSent = useRef(0);

  useEffect(() => { sessionRef.current = sharingSessionId; }, [sharingSessionId]);
  useEffect(() => () => {
    const session = sessionRef.current;
    if (session) void stopLocationSharing(tripId, session).catch(() => undefined);
  }, [tripId]);
  useEffect(() => {
    if ((!open && !sharingSessionId) || unavailable) return;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const next = await getLocationSharing(tripId);
        if (cancelled) return;
        const names = new Map(next.recipients.map((recipient) => [recipient.id, recipient.name]));
        onLocationsChange(next.locations.map((location) => ({ ...location, name: names.get(location.userId) ?? null })));
        if (!next.ownSharing && sharingSessionId) {
          setSharingSessionId(null);
          setExpiresAt(null);
          setError("위치 공유가 종료되었습니다.");
        }
      } catch (reason) {
        const message = (reason as Error).message;
        if (message === "location sharing is unavailable") setUnavailable(true);
        else if (!cancelled) setError(message);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [open, sharingSessionId, tripId, unavailable, onLocationsChange]);
  useEffect(() => {
    if (!sharingSessionId || !fix || phase !== "ready" || fix.timestamp <= lastSent.current) return;
    lastSent.current = fix.timestamp;
    void updateLocationSharing(tripId, { sharingSessionId, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, measuredAt: fix.timestamp }).catch((reason) => {
      const message = (reason as Error).message;
      if (message === "sharing session ended" || message === "login required") {
        setSharingSessionId(null);
        setExpiresAt(null);
      }
      setError(message);
    });
  }, [fix, phase, sharingSessionId, tripId]);

  async function requestConsent() {
    setPending(true); setError(null);
    try {
      const next = await getLocationSharingConsent(tripId);
      setConsent(next); setDuration(next.defaultDurationSeconds); setTakeover(false);
    } catch (reason) {
      const message = (reason as Error).message;
      if (message === "location sharing is unavailable") setUnavailable(true);
      else setError(message);
    } finally { setPending(false); }
  }
  async function beginSharing() {
    if (!consent) return;
    setPending(true); setError(null);
    try {
      const started = await startLocationSharing(tripId, { consentToken: consent.consentToken, audienceVersion: consent.audienceVersion, durationSeconds: duration, takeover });
      setSharingSessionId(started.sharingSessionId); setExpiresAt(started.expiresAt); setConsent(null); lastSent.current = 0; requestLocation();
    } catch (reason) { setError((reason as Error).message); } finally { setPending(false); }
  }
  async function stopSharing() {
    if (!sharingSessionId) return;
    setPending(true);
    try {
      await stopLocationSharing(tripId, sharingSessionId);
      setSharingSessionId(null); setExpiresAt(null); onLocationsChange([]); onFocus(null); setError(null);
    } catch (reason) { setError((reason as Error).message); } finally { setPending(false); }
  }
  return <section className="location-sharing-control" aria-label="내 위치 공유">
    <div className="location-sharing-heading">
      <div><strong>내 위치 공유</strong><p className="meta">동행자는 위치를 공유하지 않아도 볼 수 있습니다.</p></div>
      {sharingSessionId
        ? <Button type="button" variant="outline" className="location-stop" onClick={() => void stopSharing()} disabled={pending}>중지</Button>
        : <Button type="button" onClick={() => void requestConsent()} disabled={pending || unavailable} aria-expanded={Boolean(consent)}>{unavailable ? "준비 중" : pending ? "확인 중" : "공유"}</Button>}
    </div>
    {sharingSessionId && <p className="location-sharing-live" role="status">공유 중{expiresAt ? " · 종료 시간이 설정됨" : ""}{phase !== "ready" ? " · 위치 갱신 대기" : ""}</p>}
    {consent && <div className="location-sharing-consent" role="dialog" aria-label="위치 공유 확인">
      <p>아래 참여자에게 현재 위치를 공유합니다.</p>
      <ul>{consent.recipients.map((recipient) => <li key={recipient.id}>{recipient.name ?? "이름 없는 참여자"}</li>)}</ul>
      <label>공유 시간 <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{consent.durationOptions.map((seconds) => <option key={seconds} value={seconds}>{seconds === 900 ? "15분" : seconds / 3600 + "시간"}</option>)}</select></label>
      {error?.includes("takeover") && <label className="location-takeover"><input type="checkbox" checked={takeover} onChange={(event) => setTakeover(event.target.checked)} />기존 공유를 종료하고 이 기기에서 시작</label>}
      <div><Button type="button" onClick={() => void beginSharing()} disabled={pending || (error?.includes("takeover") && !takeover)}>공유 시작</Button><Button type="button" variant="ghost" onClick={() => setConsent(null)}>취소</Button></div>
    </div>}
    {unavailable && <p className="meta">위치 공유는 안전한 운영 설정이 준비되면 사용할 수 있습니다.</p>}
    {error && <p className="error">{error}</p>}
  </section>;
}
