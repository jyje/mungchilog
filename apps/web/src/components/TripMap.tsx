import { Component, useEffect, useMemo, type ReactNode } from "react";
import { Map, AdvancedMarker, Pin, useMap, useApiLoadingStatus, APILoadingStatus } from "@vis.gl/react-google-maps";
import type { Spot } from "../types";
import { RouteOverlay } from "./RouteOverlay";

const DEFAULT_CENTER = { lat: 35.6812, lng: 139.7671 }; // Tokyo Station, fallback only

type LocatedSpot = Spot & { lat: number; lng: number };

export type ItinerarySelection =
  | { kind: "spot"; spotId: string }
  | { kind: "leg"; fromId: string; toId: string }
  | null;

class MapFailureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="map-placeholder map-placeholder-overlay">
          <p>지도를 불러오지 못했습니다.</p>
          <p className="meta">지도 키 또는 네트워크 문제로 지도 상호작용을 사용할 수 없습니다. 일정 목록은 계속 사용할 수 있습니다.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// Frames the whole day's route at once (not just the first stop), same as
// the map re-fits every time spots are added/reordered/removed.
function FitToSpots({ spots }: { spots: LocatedSpot[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || spots.length === 0) return;
    if (spots.length === 1) {
      map.setCenter({ lat: spots[0].lat, lng: spots[0].lng });
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    spots.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
    map.fitBounds(bounds, 48);
  }, [map, spots]);

  return null;
}

function FocusSelection({ selection, spots }: { selection: ItinerarySelection; spots: LocatedSpot[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !selection) return;

    if (selection.kind === "spot") {
      const spot = spots.find((candidate) => candidate.id === selection.spotId);
      if (!spot) return;
      map.panTo({ lat: spot.lat, lng: spot.lng });
      map.setZoom(Math.max(map.getZoom() ?? 13, 16));
      return;
    }

    const from = spots.find((candidate) => candidate.id === selection.fromId);
    const to = spots.find((candidate) => candidate.id === selection.toId);
    if (!from || !to) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: from.lat, lng: from.lng });
    bounds.extend({ lat: to.lat, lng: to.lng });
    map.fitBounds(bounds, 96);
  }, [map, selection, spots]);

  return null;
}

// APIProvider now lives one level up, in MapsScope, so SpotForm's
// PlaceAutocompleteInput can share the same Maps JS loader/context.
export function TripMap({
  spots,
  date,
  timezone,
  selection,
  onSelect,
}: {
  spots: Spot[];
  date: string;
  timezone: string;
  selection: ItinerarySelection;
  onSelect: (selection: Exclude<ItinerarySelection, null>) => void;
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  // Numbered in visiting order (spot.order), not raw array order, so the
  // map's 1/2/3 pins always match the order shown in the day's spot list.
  const located = useMemo(
    () =>
      [...spots]
        .sort((a, b) => a.order - b.order)
        .filter((s): s is LocatedSpot => s.lat != null && s.lng != null),
    [spots],
  );

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
    <div className="map-container">
      {/* fullscreenControl={false}: Google's native fullscreen button calls
          the browser Fullscreen API on the map's own div, which fights
          with this page's own position:fixed full-viewport shell (the
          button visually renders but silently does nothing) - the layout
          menu's "지도 전체화면" already covers the same need through this
          app's own UI instead, so the native control is just removed
          rather than fought with. */}
      <MapFailureBoundary>
        <Map
          defaultCenter={center}
          defaultZoom={13}
          mapId="mungchilog-trip-map"
          disableDefaultUI={false}
          fullscreenControl={false}
        >
          <MapContent spots={spots} located={located} date={date} timezone={timezone} selection={selection} onSelect={onSelect} />
        </Map>
      </MapFailureBoundary>
    </div>
  );
}

// Split out so useApiLoadingStatus can gate marker/pin rendering: the key
// is scoped to the production referrer (docs/google-maps-setup.md), so
// local dev legitimately hits AUTH_FAILURE/FAILED here - Google's own
// marker internals throw an uncaught error if AdvancedMarker/Pin still
// try to mount against a script that failed to load, so skip them and
// show what's wrong instead.
function MapContent({
  spots,
  located,
  date,
  timezone,
  selection,
  onSelect,
}: {
  spots: Spot[];
  located: LocatedSpot[];
  date: string;
  timezone: string;
  selection: ItinerarySelection;
  onSelect: (selection: Exclude<ItinerarySelection, null>) => void;
}) {
  const status = useApiLoadingStatus();

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="map-placeholder map-placeholder-overlay">
        <p>지도를 불러오지 못했습니다.</p>
        <p className="meta">
          이 지도 키는 배포 도메인에서만 쓰도록 리퍼러가 제한돼 있어서, 로컬(<code>localhost</code>)에서는 원래
          이렇게 뜹니다 (배포된 사이트에서는 정상 동작). 로컬에서도 실제 지도를 보고 싶다면 Google Cloud
          Console → 이 키의 애플리케이션 제한사항에 <code>http://localhost:5173/*</code>를 추가해주세요.
        </p>
      </div>
    );
  }

  return (
    <>
      {located.map((s, i) => {
        const selected =
          (selection?.kind === "spot" && selection.spotId === s.id) ||
          (selection?.kind === "leg" && (selection.fromId === s.id || selection.toId === s.id));
        return (
          <AdvancedMarker
            key={s.id}
            position={{ lat: s.lat, lng: s.lng }}
            title={`${i + 1}. ${s.name}`}
            onClick={() => onSelect({ kind: "spot", spotId: s.id })}
          >
            <Pin
              glyphText={String(i + 1)}
              background={selected ? "#0284c7" : "#7dd3fc"}
              glyphColor={selected ? "#ffffff" : "#111214"}
              borderColor={selected ? "#ffffff" : "#38bdf8"}
              scale={selected ? 1.22 : 1}
            />
          </AdvancedMarker>
        );
      })}
      <RouteOverlay spots={spots} date={date} timezone={timezone} selection={selection} onSelect={onSelect} />
      <FitToSpots spots={located} />
      <FocusSelection selection={selection} spots={located} />
    </>
  );
}
