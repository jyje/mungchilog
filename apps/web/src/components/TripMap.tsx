import { APIProvider, Map, AdvancedMarker, Pin } from "@vis.gl/react-google-maps";
import type { Spot } from "../types";
import { RouteOverlay } from "./RouteOverlay";

const DEFAULT_CENTER = { lat: 35.6812, lng: 139.7671 }; // Tokyo Station, fallback only

export function TripMap({ spots, date, timezone }: { spots: Spot[]; date: string; timezone: string }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const located = spots.filter((s): s is Spot & { lat: number; lng: number } => s.lat != null && s.lng != null);

  if (!apiKey) {
    return (
      <div className="map-placeholder">
        <p>지도 API 키가 아직 설정되지 않았습니다.</p>
        <p className="meta">
          <code>VITE_GOOGLE_MAPS_API_KEY</code>가 배포되면 여기에 실제 지도가 뜹니다.
          그동안 아래 스팟 목록으로 동선을 확인하세요.
        </p>
      </div>
    );
  }

  const center = located[0] ?? DEFAULT_CENTER;

  return (
    <APIProvider apiKey={apiKey}>
      <div className="map-container">
        <Map defaultCenter={center} defaultZoom={13} mapId="mungchilog-trip-map" disableDefaultUI={false}>
          {located.map((s) => (
            <AdvancedMarker key={s.id} position={{ lat: s.lat, lng: s.lng }} title={s.name}>
              <Pin />
            </AdvancedMarker>
          ))}
          <RouteOverlay spots={spots} date={date} timezone={timezone} />
        </Map>
      </div>
    </APIProvider>
  );
}
