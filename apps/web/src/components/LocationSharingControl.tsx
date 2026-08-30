import { RefreshCw } from "lucide-react";
import type { TripLocationSharingController } from "../hooks/useTripLocationSharing";
import { Button } from "./ui/button";

export function LocationSharingControl({ controller }: { controller: TripLocationSharingController }) {
  const {
    consent,
    duration,
    setDuration,
    takeover,
    setTakeover,
    localActive,
    remoteActive,
    active,
    starting,
    interrupted,
    remaining,
    unavailable,
    pending,
    error,
    takeoverRequired,
    requestLocation,
    requestConsent,
    beginSharing,
    stopSharing,
    cancelConsent,
  } = controller;

  return <section className="location-sharing-control" aria-label="내 위치 공유">
    <div className="location-sharing-heading">
      <div><strong>내 위치 공유</strong><p className="meta">동행자는 위치를 공유하지 않아도 볼 수 있습니다.</p></div>
      {localActive
        ? <Button type="button" variant="outline" className="location-stop" onClick={() => void stopSharing()} disabled={pending}>중지</Button>
        : <Button type="button" onClick={() => void requestConsent()} disabled={pending || unavailable} aria-expanded={Boolean(consent)}>{unavailable ? "준비 중" : pending ? "확인 중" : remoteActive ? "이 기기에서 계속" : "공유"}</Button>}
    </div>
    {localActive && <div className="location-sharing-live" role="status">
      <span>{starting ? "공유 준비 중 · 현재 위치 확인 중" : interrupted ? "공유 일시 중지 · 위치 갱신 필요" : active ? "위치 공유 중" : "공유 상태 확인 중"} · {remaining}</span>
      {interrupted && <Button type="button" variant="ghost" onClick={requestLocation}><RefreshCw aria-hidden="true" />위치 다시 확인</Button>}
    </div>}
    {remoteActive && !consent && <p className="location-sharing-live" role="status">{controller.remoteOnOtherTrip ? "다른 여행을 다른 탭이나 기기에서 공유 중" : "다른 탭이나 기기에서 공유 중"} · {remaining}</p>}
    {consent && <div className="location-sharing-consent" role="dialog" aria-label="위치 공유 확인">
      <p>아래 참여자에게 현재 위치를 공유합니다.</p>
      <ul>{consent.recipients.map((recipient) => <li key={recipient.id}>{recipient.name ?? "이름 없는 참여자"}</li>)}</ul>
      <label>공유 시간 <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{consent.durationOptions.map((seconds) => <option key={seconds} value={seconds}>{seconds === 900 ? "15분" : seconds / 3_600 + "시간"}</option>)}</select></label>
      {takeoverRequired && <label className="location-takeover"><input type="checkbox" checked={takeover} onChange={(event) => setTakeover(event.target.checked)} />기존 공유를 종료하고 이 기기에서 시작</label>}
      <div><Button type="button" onClick={() => void beginSharing()} disabled={pending || (takeoverRequired && !takeover)}>공유 시작</Button><Button type="button" variant="ghost" onClick={cancelConsent}>취소</Button></div>
    </div>}
    {unavailable && <p className="meta">위치 공유는 안전한 운영 설정이 준비되면 사용할 수 있습니다.</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
