import { AdvancedMarker, Polyline } from "@vis.gl/react-google-maps";
import { CarFront, Footprints } from "lucide-react";
import { useLeg } from "../hooks/useLeg";
import { isLegacyLegMode, legPreferenceFor, selectedRouteIndex } from "../legPreferences";
import {
  connectorStroke,
  routeDirectionIcons,
  routeEmphasis,
  routeSegmentKind,
  routeSegmentMarkers,
  routeStrokeLayers,
  type RouteEmphasis,
  type RouteSegmentKind,
} from "../routeStyles";
import type { LegPreference, PersistedLegMode, Spot } from "../types";
import { Button } from "./ui/button";
import { TransitVehicleIcon } from "./system/TransitVehicleIcon";
import type { ItinerarySelection } from "./TripMap";

type Coordinate = { lat: number; lng: number };

const ACCESS_CONNECTOR_MIN_METERS = 8;
const ACCESS_CONNECTOR_MAX_METERS = 120;

function decodeEncodedPolyline(encodedPath: string): Coordinate[] {
  const coordinates: Coordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  try {
    while (index < encodedPath.length) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encodedPath.charCodeAt(index++) - 63;
        if (!Number.isFinite(byte)) return [];
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      latitude += result & 1 ? ~(result >> 1) : result >> 1;

      result = 0;
      shift = 0;
      do {
        byte = encodedPath.charCodeAt(index++) - 63;
        if (!Number.isFinite(byte)) return [];
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      longitude += result & 1 ? ~(result >> 1) : result >> 1;
      coordinates.push({ lat: latitude / 1e5, lng: longitude / 1e5 });
    }
  } catch {
    return [];
  }

  return coordinates;
}

function distanceMeters(a: Coordinate, b: Coordinate): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (b.lat - a.lat) * radians;
  const longitudeDelta = (b.lng - a.lng) * radians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function accessConnector(anchor: Coordinate, spot: Spot): Coordinate[] | null {
  if (spot.lat == null || spot.lng == null) return null;
  const place = { lat: spot.lat, lng: spot.lng };
  const distance = distanceMeters(anchor, place);
  // Google snaps route geometry to its navigable network. A short dotted
  // connector explains the remaining entrance or property-centroid gap,
  // while refusing to invent a long straight route when a place is imprecise.
  if (distance < ACCESS_CONNECTOR_MIN_METERS || distance > ACCESS_CONNECTOR_MAX_METERS) return null;
  return [anchor, place];
}

function RouteAccessConnectors({
  encodedPath,
  from,
  to,
  emphasis,
  kind,
  onSelect,
}: {
  encodedPath: string;
  from: Spot;
  to: Spot;
  emphasis: RouteEmphasis;
  kind: RouteSegmentKind;
  onSelect: () => void;
}) {
  const coordinates = decodeEncodedPolyline(encodedPath);
  if (coordinates.length < 2) return null;

  const paths = [
    accessConnector(coordinates[0], from),
    accessConnector(coordinates[coordinates.length - 1], to),
  ].filter((path): path is Coordinate[] => path !== null);
  if (paths.length === 0) return null;

  // Access connectors are part of the same itinerary leg, not an unrelated
  // annotation. Their color and emphasis therefore track the route itself.
  const { strokeColor, strokeOpacity, strokeWeight, zIndex } = connectorStroke(emphasis, kind);
  return (
    <>
      {paths.map((path) => (
        <Polyline
          key={`${path[0].lat}:${path[0].lng}:${path[1].lat}:${path[1].lng}`}
          path={path}
          strokeColor={strokeColor}
          strokeOpacity={0}
          strokeWeight={strokeWeight}
          zIndex={zIndex}
          icons={[
            {
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: strokeColor,
                fillOpacity: strokeOpacity,
                strokeColor,
                strokeOpacity,
                strokeWeight: 1,
                scale: emphasis === "selected" ? 2.4 : 2,
              },
              offset: "0",
              repeat: "7px",
            },
          ]}
          onClick={onSelect}
        />
      ))}
    </>
  );
}

/**
 * One route line, drawn as a white casing beneath a coloured core. Google
 * Maps has no native casing, so it has to be two stacked polylines; the
 * casing is what separates the line from water and parks on the basemap.
 *
 * The casing is never clickable. It is wider than the core, so leaving it
 * clickable would let it swallow clicks meant for its own core and, where two
 * legs run alongside each other, for the neighbouring leg as well.
 */
function CasedRoute({
  encodedPath,
  path,
  kind,
  emphasis,
  fallback,
  onSelect,
}: {
  encodedPath?: string;
  path?: Coordinate[];
  kind: RouteSegmentKind;
  emphasis: RouteEmphasis;
  fallback?: boolean;
  onSelect: () => void;
}) {
  const { casing, core } = routeStrokeLayers({ kind, emphasis, fallback });
  const geometry = encodedPath ? { encodedPath } : { path };
  return (
    <>
      {casing && <Polyline {...geometry} {...casing} clickable={false} />}
      <Polyline {...geometry} {...core} icons={routeDirectionIcons({ kind, emphasis })} onClick={onSelect} />
    </>
  );
}

/**
 * A mode-icon badge at the start of one walk-or-ride run - the T-map-style
 * "you start walking here" / "board here" cue. Skipped for a dimmed leg (see
 * RouteLeg): with several legs on a day, lighting every one of these up at
 * once while another leg is selected reads as clutter, not information.
 */
function RouteModeMarker({
  position,
  kind,
  vehicle,
  mode,
}: {
  position: Coordinate;
  kind: RouteSegmentKind;
  vehicle: string | null;
  mode: PersistedLegMode;
}) {
  return (
    <AdvancedMarker position={position}>
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        className={`route-mode-marker route-mode-marker--${kind.toLowerCase()}`}
      >
        {kind === "WALK" ? (
          <Footprints aria-hidden="true" />
        ) : mode === "DRIVE" ? (
          <CarFront aria-hidden="true" />
        ) : (
          <TransitVehicleIcon vehicle={vehicle} />
        )}
      </Button>
    </AdvancedMarker>
  );
}

/**
 * One marker per walk-or-ride run (see routeSegmentMarkers), plus - when the
 * route has no per-step segments at all (a walk/drive leg, or an old cache
 * row) - a single marker at the whole line's start standing in for the one
 * run the leg is entirely made of.
 */
function RouteModeMarkers({
  mode,
  polyline,
  segments,
  transit,
}: {
  mode: PersistedLegMode;
  polyline: string;
  segments: Array<{ travelMode: string; polyline: string }> | null | undefined;
  transit: Array<{ vehicle: string | null }> | null;
}) {
  if (segments?.length) {
    return (
      <>
        {routeSegmentMarkers(mode, segments, transit).map((marker) => {
          const [position] = decodeEncodedPolyline(segments[marker.segmentIndex].polyline);
          if (!position) return null;
          return (
            <RouteModeMarker
              key={marker.segmentIndex}
              position={position}
              kind={marker.kind}
              vehicle={marker.vehicle}
              mode={mode}
            />
          );
        })}
      </>
    );
  }
  const [position] = decodeEncodedPolyline(polyline);
  if (!position) return null;
  return (
    <RouteModeMarker position={position} kind={routeSegmentKind(mode)} vehicle={transit?.[0]?.vehicle ?? null} mode={mode} />
  );
}

function RouteLeg({
  from,
  to,
  date,
  timezone,
  preference,
  selected,
  hasSelection,
  onSelect,
}: {
  from: Spot;
  to: Spot;
  date: string;
  timezone: string;
  preference: LegPreference;
  selected: boolean;
  hasSelection: boolean;
  onSelect: () => void;
}) {
  const mode = preference.mode;
  const { data: leg } = useLeg(from, to, mode, preference.trafficAware, date, timezone, preference.timing);
  // Resolve by fingerprint, not position: the provider may reorder
  // alternatives between cache refreshes.
  const selectedRoute = leg?.routes[selectedRouteIndex(leg?.routes, preference)];
  const emphasis = routeEmphasis(selected, hasSelection);

  if (!isLegacyLegMode(mode) && selectedRoute?.polyline) {
    // Real road/rail-following route from the Routes API - what "the
    // route between stops" actually means once a server key exists.
    //
    // A transit journey arrives split into steps, which is the only way to
    // draw the walk to the station differently from the ride. Everything else
    // - a walk or drive leg, or an entry cached before step geometry was
    // requested - is one uniform line.
    const segments = selectedRoute.segments;
    return (
      <>
        {segments?.length ? (
          segments.map((segment, index) => (
            <CasedRoute
              key={`${index}:${segment.polyline.slice(0, 16)}`}
              encodedPath={segment.polyline}
              kind={routeSegmentKind(mode, segment.travelMode)}
              emphasis={emphasis}
              onSelect={onSelect}
            />
          ))
        ) : (
          <CasedRoute
            encodedPath={selectedRoute.polyline}
            kind={routeSegmentKind(mode)}
            emphasis={emphasis}
            onSelect={onSelect}
          />
        )}
        {emphasis !== "dimmed" && (
          <RouteModeMarkers mode={mode} polyline={selectedRoute.polyline} segments={segments} transit={selectedRoute.transit ?? null} />
        )}
        <RouteAccessConnectors
          // Deliberately the whole-journey line, not a segment: the connectors
          // bridge the gap between the route's real ends and the stops, and
          // the first and last segments are the same ends.
          encodedPath={selectedRoute.polyline}
          from={from}
          to={to}
          emphasis={emphasis}
          kind={routeSegmentKind(mode)}
          onSelect={onSelect}
        />
      </>
    );
  }

  // No key yet, or this leg hasn't resolved: a straight line is still a
  // useful "you go this way next" cue as long as both ends have coordinates,
  // and it upgrades to the real route with no code change once the leg above
  // returns data. Drawn grey rather than route-coloured so it never passes
  // for a real route.
  if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) return null;
  return (
    <CasedRoute
      path={[
        { lat: from.lat, lng: from.lng },
        { lat: to.lat, lng: to.lng },
      ]}
      kind={routeSegmentKind(mode)}
      emphasis={emphasis}
      fallback
      onSelect={onSelect}
    />
  );
}

// One leg per consecutive spot pair for the day, each independently
// resolved (and cached) via useLeg - see hooks/useLeg.ts. Must render
// inside <Map>...</Map> (uses the Polyline component's map context).
export function RouteOverlay({
  spots,
  date,
  timezone,
  legPreferences,
  selection,
  onSelect,
}: {
  spots: Spot[];
  date: string;
  timezone: string;
  legPreferences: LegPreference[];
  selection: ItinerarySelection;
  onSelect: (selection: Exclude<ItinerarySelection, null>) => void;
}) {
  const sorted = [...spots].sort((a, b) => a.order - b.order);
  return (
    <>
      {sorted.slice(0, -1).map((spot, i) => (
        <RouteLeg
          key={spot.id}
          from={spot}
          to={sorted[i + 1]}
          date={date}
          timezone={timezone}
          preference={legPreferenceFor(legPreferences, spot.id, sorted[i + 1].id)}
          selected={selection?.kind === "leg" && selection.fromId === spot.id && selection.toId === sorted[i + 1].id}
          hasSelection={selection !== null}
          onSelect={() => onSelect({ kind: "leg", fromId: spot.id, toId: sorted[i + 1].id })}
        />
      ))}
    </>
  );
}
