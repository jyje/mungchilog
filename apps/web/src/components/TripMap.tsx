import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Map, AdvancedMarker, Pin, useMap, useApiLoadingStatus, APILoadingStatus } from "@vis.gl/react-google-maps";
import type { Spot } from "../types";
import { RouteOverlay } from "./RouteOverlay";
import { CurrentLocation } from "./CurrentLocation";
import { useMapViewportInsets } from "./MapViewportContext";
import { cameraOffset, framePadding, panToVisibleCenter } from "./mapCamera";

const DEFAULT_CENTER = { lat: 35.6812, lng: 139.7671 }; // Tokyo Station, fallback only

type LocatedSpot = Spot & { lat: number; lng: number };

export type ItinerarySelection =
  | { kind: "spot"; spotId: string }
  | { kind: "leg"; fromId: string; toId: string }
  | null;

function MapUnavailable({ overlay = false }: { overlay?: boolean }) {
  const insets = useMapViewportInsets();
  return (
    <div className={`map-placeholder${overlay ? " map-placeholder-overlay" : ""}`} style={{ paddingTop: insets.top + 16, paddingRight: insets.right + 16, paddingLeft: insets.left + 16, paddingBottom: insets.bottom + 16, justifyContent: "flex-start", overflowY: "auto" }}>
      <p>지도를 불러오지 못했습니다.</p>
      <p className="meta">일정 목록은 계속 이용할 수 있습니다. 잠시 후 다시 열어주세요.</p>
    </div>
  );
}

class MapFailureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <MapUnavailable overlay />;
    }
    return this.props.children;
  }
}

// Frames the whole day's route at once (not just the first stop), same as
// the map re-fits every time spots are added/reordered/removed.
function FitToSpots({ spots }: { spots: LocatedSpot[] }) {
  const map = useMap();
  const insets = useMapViewportInsets();
  const lastFrame = useRef<{ map: google.maps.Map; key: string } | null>(null);
  const key = spots.map((spot) => `${spot.id}:${spot.lat}:${spot.lng}`).join("|");

  useEffect(() => {
    if (!map || spots.length === 0) { lastFrame.current = null; return; }
    // A refetch or a note/name edit can recreate the spots array. Only an
    // actual route change should undo personal camera exploration/recentering.
    if (lastFrame.current?.map === map && lastFrame.current.key === key) return;
    lastFrame.current = { map, key };
    if (spots.length === 1) {
      map.setZoom(15);
      panToVisibleCenter(map, { lat: spots[0].lat, lng: spots[0].lng }, insets);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    spots.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
    map.fitBounds(bounds, framePadding(insets));
  }, [map, spots, key, insets]);

  return null;
}

function FocusSelection({ selection, spots }: { selection: ItinerarySelection; spots: LocatedSpot[] }) {
  const map = useMap();
  const insets = useMapViewportInsets();
  const lastFocus = useRef<{ map: google.maps.Map; key: string } | null>(null);
  const key = JSON.stringify([selection, spots.map(({ id, lat, lng }) => [id, lat, lng])]);

  useEffect(() => {
    if (!map || !selection) { lastFocus.current = null; return; }
    if (lastFocus.current?.map === map && lastFocus.current.key === key) return;
    lastFocus.current = { map, key };

    if (selection.kind === "spot") {
      const spot = spots.find((candidate) => candidate.id === selection.spotId);
      if (!spot) return;
      map.setZoom(Math.max(map.getZoom() ?? 13, 16));
      panToVisibleCenter(map, { lat: spot.lat, lng: spot.lng }, insets);
      return;
    }

    const from = spots.find((candidate) => candidate.id === selection.fromId);
    const to = spots.find((candidate) => candidate.id === selection.toId);
    if (!from || !to) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: from.lat, lng: from.lng });
    bounds.extend({ lat: to.lat, lng: to.lng });
    map.fitBounds(bounds, framePadding(insets, 48));
  }, [map, selection, spots, key, insets]);

  return null;
}

// Layout changes preserve the existing focal point, including a manually
// explored location. They must not reselect or rezoom the itinerary.
function PreserveVisibleCenter() {
  const map = useMap();
  const insets = useMapViewportInsets();
  const previous = useRef<{ map: google.maps.Map; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!map) return;
    const next = cameraOffset(insets);
    const old = previous.current;
    previous.current = { map, ...next };
    if (old?.map === map && (old.x !== next.x || old.y !== next.y)) {
      map.panBy(next.x - old.x, next.y - old.y);
    }
  }, [map, insets]);
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
    return <MapUnavailable />;
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
    return <MapUnavailable overlay />;
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
      <PreserveVisibleCenter />
      {status === APILoadingStatus.LOADED && <CurrentLocation />}
    </>
  );
}
