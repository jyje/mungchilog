import { useEffect, useRef } from "react";
import { AdvancedMarker, AdvancedMarkerAnchorPoint, Circle, useMap } from "@vis.gl/react-google-maps";
import { Crosshair } from "lucide-react";
import { useDeviceLocation } from "../hooks/useDeviceLocation";
import { LOW_ACCURACY_METERS, type DeviceLocationState, type LocationPhase } from "../location/deviceLocation";
import "./current-location.css";
import { useMapViewportInsets } from "./MapViewportContext";
import { panToVisibleCenter } from "./mapCamera";
import { MapIconButton } from "./system/MapIconButton";

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

export function CurrentLocation({ showControl = true }: { showControl?: boolean } = {}) {
  const location = useDeviceLocation();
  const { fix, phase } = location;
  const status = locationStatusText(location);
  const muted = phase !== "ready";

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
      {showControl && <CurrentLocationControl />}
    </>
  );
}

/** The button half can live in the shared app-control rail while the marker
 * half remains a direct child of the map overlay. */
export function CurrentLocationControl() {
  const map = useMap();
  const insets = useMapViewportInsets();
  const lastRequest = useRef<ReturnType<typeof useDeviceLocation>["requestedFix"]>(null);
  const location = useDeviceLocation();
  const { fix, phase, requestedFix, requestLocation } = location;
  const status = locationStatusText(location);
  const showStatus = Boolean(status) && (phase !== "ready" || (fix?.accuracy ?? 0) > LOW_ACCURACY_METERS);
  const announcement = GUIDANCE[phase] ?? (fix ? fix.accuracy > LOW_ACCURACY_METERS ? "대략적인 현재 위치를 확인했습니다. 오차 범위를 확인해주세요." : "현재 위치를 확인했습니다." : "");

  useEffect(() => {
    if (!map || !requestedFix || requestedFix === lastRequest.current) return;
    lastRequest.current = requestedFix;
    const zoom = requestedFix.accuracy > 5_000 ? 10 : requestedFix.accuracy > 1_000 ? 12 : requestedFix.accuracy > 100 ? 14 : 16;
    map.setZoom(zoom);
    panToVisibleCenter(map, { lat: requestedFix.lat, lng: requestedFix.lng }, insets);
  }, [map, requestedFix, insets]);

  return (
    <div className={`device-location-control${showStatus ? " has-status" : ""}`}>
      <MapIconButton
        icon={<Crosshair className="size-5" aria-hidden="true" />}
        label="현재 위치"
        className="device-location-button"
        aria-describedby={showStatus ? "device-location-status" : undefined}
        aria-busy={phase === "acquiring"}
        disabled={phase === "acquiring"}
        onClick={requestLocation}
      />
      {showStatus && <p className="device-location-status" id="device-location-status" aria-live="off">{status}</p>}
      <span className="device-location-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    </div>
  );
}
