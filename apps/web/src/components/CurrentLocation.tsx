import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AdvancedMarker, AdvancedMarkerAnchorPoint, Circle, useMap } from "@vis.gl/react-google-maps";
import { useDeviceLocation } from "../hooks/useDeviceLocation";
import { LOW_ACCURACY_METERS, type DeviceLocationState, type LocationPhase } from "../location/deviceLocation";
import "./current-location.css";
import { useMapViewportInsets } from "./MapViewportContext";
import { panToVisibleCenter } from "./mapCamera";

const GUIDANCE: Partial<Record<LocationPhase, string>> = {
  acquiring: "현재 위치를 확인하고 있습니다.",
  denied: "위치 권한이 꺼져 있습니다. 브라우저의 사이트 설정에서 위치를 허용한 뒤 다시 눌러주세요.",
  unavailable: "현재 위치를 확인할 수 없습니다. 기기의 위치 설정과 연결 상태를 확인한 뒤 다시 눌러주세요.",
  timeout: "위치 확인 시간이 초과되었습니다. 현재 위치 버튼으로 다시 시도해주세요.",
  unsupported: "이 브라우저는 위치 확인을 지원하지 않습니다. 일정은 계속 이용할 수 있습니다.",
  insecure: "안전한 연결에서만 위치를 확인할 수 있습니다. HTTPS 주소로 접속해주세요.",
  paused: "위치 확인이 일시 중지되었습니다. 현재 위치 버튼을 눌러 다시 확인해주세요.",
  stale: "위치 갱신이 지연되고 있습니다. 현재 위치와 다를 수 있으니 다시 확인해주세요.",
};

function locationStatusText({ phase, fix }: DeviceLocationState): string {
  const guidance = GUIDANCE[phase];
  const updated = fix ? `마지막 확인 ${new Date(fix.timestamp).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "";
  if (guidance) return [guidance, phase !== "acquiring" ? updated : ""].filter(Boolean).join(" ");
  if (!fix) return "";
  const accuracy = fix.accuracy >= 1_000 ? `${(fix.accuracy / 1_000).toFixed(1)}km` : `${Math.ceil(fix.accuracy)}m`;
  return `${fix.accuracy > LOW_ACCURACY_METERS ? "대략적인 위치입니다. " : ""}오차 범위 약 ${accuracy}. ${updated}. 내 위치는 동행자에게 공유되지 않습니다.`;
}

export function CurrentLocation() {
  const map = useMap();
  const insets = useMapViewportInsets();
  const lastRequest = useRef<typeof requestedFix>(null);
  const location = useDeviceLocation();
  const { fix, phase, requestedFix, requestLocation } = location;
  const [touchTooltip, setTouchTooltip] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  function cancelHold() {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdStart.current = null;
  }
  useEffect(() => () => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
  }, []);
  const status = locationStatusText(location);
  const muted = phase !== "ready";
  // Announce meaningful changes, not each GPS timestamp or accuracy fluctuation.
  const announcement = GUIDANCE[phase] ?? (fix ? fix.accuracy > LOW_ACCURACY_METERS ? "대략적인 현재 위치를 확인했습니다. 오차 범위를 확인해주세요." : "현재 위치를 확인했습니다." : "");

  useEffect(() => {
    if (!map || !requestedFix || requestedFix === lastRequest.current) return;
    lastRequest.current = requestedFix;
    // A broad network estimate should not be presented at building-level zoom.
    const zoom = requestedFix.accuracy > 5_000 ? 10 : requestedFix.accuracy > 1_000 ? 12 : requestedFix.accuracy > 100 ? 14 : 16;
    map.setZoom(zoom);
    panToVisibleCenter(map, { lat: requestedFix.lat, lng: requestedFix.lng }, insets);
  }, [map, requestedFix, insets]);

  return (
    <>
      {fix && <>
        <Circle
          center={{ lat: fix.lat, lng: fix.lng }} radius={fix.accuracy}
          strokeColor={muted ? "#64748b" : "#2563eb"} strokeOpacity={0.65} strokeWeight={1}
          fillColor={muted ? "#64748b" : "#2563eb"} fillOpacity={0.12} clickable={false}
        />
        <AdvancedMarker position={{ lat: fix.lat, lng: fix.lng }} anchorPoint={AdvancedMarkerAnchorPoint.CENTER} zIndex={1_000} title={status}>
          <span className={`device-location-marker${muted ? " is-stale" : ""}`} role="img" aria-label={phase === "ready" ? "내 현재 위치" : "마지막으로 확인한 내 위치"} />
        </AdvancedMarker>
      </>}
      <div className="device-location-controls" style={{ "--map-control-right": `${insets.right}px`, "--map-control-bottom": `${insets.bottom}px`, "--map-control-left": `${insets.left}px` } as CSSProperties}>
        <div className={`device-location-action${touchTooltip ? " show-touch-tooltip" : ""}`}>
          <button type="button" className="device-location-button" aria-label="현재 위치" aria-describedby={status ? "device-location-status" : undefined}
            title="현재 위치" aria-busy={phase === "acquiring"} disabled={phase === "acquiring"}
            onPointerDown={(event) => {
              cancelHold();
              suppressClick.current = false;
              setTouchTooltip(false);
              if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
              holdStart.current = { x: event.clientX, y: event.clientY };
              holdTimer.current = setTimeout(() => {
                holdTimer.current = null;
                suppressClick.current = true;
                setTouchTooltip(true);
              }, 600);
            }}
            onPointerMove={(event) => {
              if (holdStart.current && Math.hypot(event.clientX - holdStart.current.x, event.clientY - holdStart.current.y) > 10) {
                cancelHold();
                suppressClick.current = true;
                setTouchTooltip(false);
              }
            }}
            onPointerUp={cancelHold}
            onPointerCancel={() => { cancelHold(); suppressClick.current = true; setTouchTooltip(false); }}
            onPointerLeave={() => { if (holdStart.current) suppressClick.current = true; cancelHold(); setTouchTooltip(false); }}
            onContextMenu={(event) => event.preventDefault()}
            onBlur={() => { cancelHold(); setTouchTooltip(false); }}
            onKeyDown={(event) => { suppressClick.current = false; if (event.key === "Escape") setTouchTooltip(false); }}
            onClick={() => { if (!suppressClick.current) requestLocation(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
              <path d="M12 1v4m0 14v4M1 12h4m14 0h4" />
            </svg>
          </button>
          <span className="device-location-tooltip" aria-hidden="true">현재 위치</span>
        </div>
        {status && <p className="device-location-status" id="device-location-status" aria-live="off">{status}</p>}
        <span className="device-location-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
      </div>
    </>
  );
}
