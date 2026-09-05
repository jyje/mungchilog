import { Component, useMemo, useState, type ReactNode } from "react";
import {
  AdvancedMarker,
  APILoadingStatus,
  Map,
  Pin,
  useApiLoadingStatus,
} from "@vis.gl/react-google-maps";
import { RouteOverlay } from "@/components/RouteOverlay";
import { MapsScope } from "@/components/MapsScope";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PlannerChoiceGroup, PlannerChoiceItem } from "@/components/system/PlannerChoiceGroup";
import { useLeg } from "@/hooks/useLeg";
import { ROUTE_LINE_WIDTH_PX } from "@/routeStyles";
import type { ItinerarySelection } from "@/components/TripMap";
import type { LegPreference, PersistedLegMode, Spot } from "@/types";

const WESTMINSTER: Spot = {
  id: "gallery-westminster",
  order: 0,
  name: "웨스트민스터 궁전",
  lat: 51.5007,
  lng: -0.1246,
  bufferMinutes: 10,
  items: [],
};

const BRITISH_MUSEUM: Spot = {
  id: "gallery-british-museum",
  order: 1,
  name: "영국 박물관",
  lat: 51.5194,
  lng: -0.127,
  bufferMinutes: 10,
  items: [],
};

const GALLERY_SPOTS = [WESTMINSTER, BRITISH_MUSEUM];
const ROUTE_MODES: ReadonlyArray<{ mode: Exclude<PersistedLegMode, "DIRECT">; label: string }> = [
  { mode: "WALK", label: "도보" },
  { mode: "TRANSIT", label: "대중교통" },
  { mode: "DRIVE", label: "운전" },
];
const ZOOM_PRESETS = [
  { zoom: 11, label: "광역" },
  { zoom: 13, label: "도시" },
  { zoom: 16, label: "거리" },
] as const;

function nextServiceDeparture(timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  const localDate = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  // A stable future service window keeps the gallery useful overnight and
  // avoids creating a new transit cache key every minute it is opened.
  return { date: new Date(localDate + 86_400_000).toISOString().slice(0, 10), time: "10:00" };
}

function routePreference(mode: Exclude<PersistedLegMode, "DIRECT">, date: string, time: string): LegPreference {
  return {
    fromSpotId: WESTMINSTER.id,
    toSpotId: BRITISH_MUSEUM.id,
    mode,
    routeIndex: 0,
    timing: { kind: "DEPART_AT", date, time },
    trafficAware: false,
  };
}

function GalleryMapUnavailable() {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-card p-6 text-center"
      role="status"
      aria-label="실제 지도 연결 상태"
    >
      <p className="font-medium">이 출처에서는 실제 지도를 불러올 수 없습니다.</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        브라우저 키의 HTTP referrer 허용 목록을 확인하세요. 경로선 토큰과 정적 범례는 계속 검토할 수 있습니다.
      </p>
    </div>
  );
}

class GalleryMapFailureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <GalleryMapUnavailable /> : this.props.children;
  }
}

function GalleryMapElements({
  departure,
  preference,
  selection,
  setSelection,
}: {
  departure: { date: string; time: string };
  preference: LegPreference;
  selection: ItinerarySelection;
  setSelection: (selection: ItinerarySelection) => void;
}) {
  const status = useApiLoadingStatus();
  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return <GalleryMapUnavailable />;
  }

  return (
    <>
      {GALLERY_SPOTS.map((spot, index) => {
        const selected =
          (selection?.kind === "spot" && selection.spotId === spot.id) ||
          (selection?.kind === "leg" && (selection.fromId === spot.id || selection.toId === spot.id));
        return (
          <AdvancedMarker
            key={spot.id}
            position={{ lat: spot.lat!, lng: spot.lng! }}
            title={`${index + 1}. ${spot.name}`}
            onClick={() => setSelection({ kind: "spot", spotId: spot.id })}
          >
            <Pin
              glyphText={String(index + 1)}
              background={selected ? "#0284c7" : "#7dd3fc"}
              glyphColor={selected ? "#ffffff" : "#111214"}
              borderColor={selected ? "#ffffff" : "#38bdf8"}
              scale={selected ? 1.15 : 1}
            />
          </AdvancedMarker>
        );
      })}
      <RouteOverlay
        spots={GALLERY_SPOTS}
        date={departure.date}
        timezone="Europe/London"
        legPreferences={[preference]}
        selection={selection}
        onSelect={setSelection}
      />
    </>
  );
}

function GalleryRouteMapContent() {
  const [mode, setMode] = useState<Exclude<PersistedLegMode, "DIRECT">>("TRANSIT");
  const [zoom, setZoom] = useState(13);
  const [selection, setSelection] = useState<ItinerarySelection>({
    kind: "leg",
    fromId: WESTMINSTER.id,
    toId: BRITISH_MUSEUM.id,
  });
  const departure = useMemo(() => nextServiceDeparture("Europe/London"), []);
  const preference = useMemo(
    () => routePreference(mode, departure.date, departure.time),
    [departure.date, departure.time, mode],
  );
  const leg = useLeg(
    WESTMINSTER,
    BRITISH_MUSEUM,
    mode,
    preference.trafficAware,
    departure.date,
    "Europe/London",
    preference.timing,
  );
  const routeReady = Boolean(leg.data?.routes.some((route) => route.polyline));

  return (
    <div className="overflow-hidden rounded-xl border bg-card text-card-foreground" data-gallery-route-map>
      <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">웨스트민스터 궁전 → 영국 박물관</h3>
            <Badge variant={routeReady ? "default" : "secondary"}>
              {leg.isPending
                ? "실제 경로 불러오는 중"
                : leg.isError
                  ? "경로 API 연결 필요"
                  : routeReady
                    ? "Google 실제 경로"
                    : "직선 미리보기"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            지도를 확대하거나 축소해도 선택 경로는 {ROUTE_LINE_WIDTH_PX.selected.core}px 중심선과{" "}
            {ROUTE_LINE_WIDTH_PX.selected.casing}px 강조선으로 유지됩니다.
          </p>
        </div>
        <PlannerChoiceGroup
          value={mode}
          onValueChange={(value) => value && setMode(value as Exclude<PersistedLegMode, "DIRECT">)}
          aria-label="예시 경로 교통수단"
        >
          {ROUTE_MODES.map((option) => (
            <PlannerChoiceItem key={option.mode} value={option.mode}>
              {option.label}
            </PlannerChoiceItem>
          ))}
        </PlannerChoiceGroup>
      </div>

      <div className="relative h-[28rem] min-h-80 bg-muted">
        <GalleryMapFailureBoundary>
          <Map
            mapId="mungchilog-trip-map"
            defaultCenter={{ lat: 51.5101, lng: -0.1258 }}
            zoom={zoom}
            onZoomChanged={(event) => setZoom(event.detail.zoom)}
            gestureHandling="cooperative"
            fullscreenControl={false}
            streetViewControl={false}
            mapTypeControl={false}
            reuseMaps
            aria-label="실제 지도 경로 두께 예시"
          >
            <GalleryMapElements
              departure={departure}
              preference={preference}
              selection={selection}
              setSelection={setSelection}
            />
          </Map>
        </GalleryMapFailureBoundary>

        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
          <Badge className="bg-background/95 text-foreground shadow-sm backdrop-blur" variant="outline">
            Zoom {zoom.toFixed(1)} · selected {ROUTE_LINE_WIDTH_PX.selected.core}px
          </Badge>
          <ToggleGroup
            type="single"
            value={ZOOM_PRESETS.some((preset) => preset.zoom === Math.round(zoom)) ? String(Math.round(zoom)) : ""}
            onValueChange={(value) => value && setZoom(Number(value))}
            variant="outline"
            className="rounded-xl bg-background/95 p-1 shadow-lg backdrop-blur"
            aria-label="지도 확대 단계"
          >
            {ZOOM_PRESETS.map((preset) => (
              <ToggleGroupItem
                key={preset.zoom}
                value={String(preset.zoom)}
                aria-label={`${preset.label} 보기, 줌 ${preset.zoom}`}
                className="min-w-14 text-foreground data-[state=on]:text-foreground"
              >
                {preset.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
    </div>
  );
}

export function GalleryRouteMap() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey) {
    return (
      <div
        className="rounded-xl border border-dashed bg-muted/40 p-5"
        role="status"
        aria-label="실제 지도 길찾기 상태"
      >
        <p className="font-medium">실제 지도 길찾기</p>
        <p className="mt-1 text-sm text-muted-foreground">
          로컬 환경에 Google Maps 브라우저 키를 설정하면 웨스트민스터 궁전에서 영국 박물관까지의 경로와 줌별 고정 두께를 확인할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <MapsScope>
      <GalleryRouteMapContent />
    </MapsScope>
  );
}
