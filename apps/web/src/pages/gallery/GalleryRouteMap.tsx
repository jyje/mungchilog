import { useMemo, useState } from "react";
import { AdvancedMarker, Map, Pin } from "@vis.gl/react-google-maps";
import { RouteOverlay } from "@/components/RouteOverlay";
import { MapsScope } from "@/components/MapsScope";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLeg } from "@/hooks/useLeg";
import { ROUTE_LINE_WIDTH_PX } from "@/routeStyles";
import type { ItinerarySelection } from "@/components/TripMap";
import type { LegPreference, PersistedLegMode, Spot } from "@/types";

const SEOUL_STATION: Spot = {
  id: "gallery-seoul-station",
  order: 0,
  name: "서울역",
  lat: 37.5547,
  lng: 126.9707,
  bufferMinutes: 10,
  items: [],
};

const N_SEOUL_TOWER: Spot = {
  id: "gallery-n-seoul-tower",
  order: 1,
  name: "N서울타워",
  lat: 37.5512,
  lng: 126.9882,
  bufferMinutes: 10,
  items: [],
};

const GALLERY_SPOTS = [SEOUL_STATION, N_SEOUL_TOWER];
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

function seoulDepartureAfter(minutes: number): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(Date.now() + minutes * 60_000))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function routePreference(mode: Exclude<PersistedLegMode, "DIRECT">, date: string, time: string): LegPreference {
  return {
    fromSpotId: SEOUL_STATION.id,
    toSpotId: N_SEOUL_TOWER.id,
    mode,
    routeIndex: 0,
    timing: { kind: "DEPART_AT", date, time },
    trafficAware: false,
  };
}

function GalleryRouteMapContent() {
  const [mode, setMode] = useState<Exclude<PersistedLegMode, "DIRECT">>("TRANSIT");
  const [zoom, setZoom] = useState(13);
  const [selection, setSelection] = useState<ItinerarySelection>({
    kind: "leg",
    fromId: SEOUL_STATION.id,
    toId: N_SEOUL_TOWER.id,
  });
  const departure = useMemo(() => seoulDepartureAfter(15), []);
  const preference = useMemo(
    () => routePreference(mode, departure.date, departure.time),
    [departure.date, departure.time, mode],
  );
  const leg = useLeg(
    SEOUL_STATION,
    N_SEOUL_TOWER,
    mode,
    preference.trafficAware,
    departure.date,
    "Asia/Seoul",
    preference.timing,
  );
  const routeReady = Boolean(leg.data?.routes.some((route) => route.polyline));

  return (
    <div className="overflow-hidden rounded-xl border bg-card text-card-foreground" data-gallery-route-map>
      <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">서울역 → N서울타워</h3>
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
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => value && setMode(value as Exclude<PersistedLegMode, "DIRECT">)}
          variant="outline"
          aria-label="예시 경로 교통수단"
        >
          {ROUTE_MODES.map((option) => (
            <ToggleGroupItem key={option.mode} value={option.mode} className="text-foreground data-[state=on]:text-foreground">
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="relative h-[28rem] min-h-80 bg-muted">
        <Map
          mapId="mungchilog-trip-map"
          defaultCenter={{ lat: 37.5531, lng: 126.9794 }}
          zoom={zoom}
          onZoomChanged={(event) => setZoom(event.detail.zoom)}
          gestureHandling="cooperative"
          fullscreenControl={false}
          streetViewControl={false}
          mapTypeControl={false}
          reuseMaps
          aria-label="실제 지도 경로 두께 예시"
        >
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
            timezone="Asia/Seoul"
            legPreferences={[preference]}
            selection={selection}
            onSelect={setSelection}
          />
        </Map>

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
          로컬 환경에 Google Maps 브라우저 키를 설정하면 서울역에서 N서울타워까지의 경로와 줌별 고정 두께를 확인할 수 있습니다.
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
