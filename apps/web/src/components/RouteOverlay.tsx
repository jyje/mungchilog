import { Polyline } from "@vis.gl/react-google-maps";
import { useLeg } from "../hooks/useLeg";
import { isLegacyLegMode, legPreferenceFor, selectedRouteIndex } from "../legPreferences";
import type { LegPreference, Spot } from "../types";
import type { ItinerarySelection } from "./TripMap";

// Direction arrows repeated along the line, not just an arrowhead at the
// end - readable at a glance for a multi-stop day, not just point A to B.
const ARROW_ICONS: google.maps.IconSequence[] = [
  {
    icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
    offset: "0",
    repeat: "12px",
  },
];

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
  selected,
  hasSelection,
  onSelect,
}: {
  encodedPath: string;
  from: Spot;
  to: Spot;
  selected: boolean;
  hasSelection: boolean;
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
  const color = selected ? "#f59e0b" : "#7dd3fc";
  const opacity = selected ? 1 : hasSelection ? 0.28 : 0.85;
  return (
    <>
      {paths.map((path) => (
        <Polyline
          key={`${path[0].lat}:${path[0].lng}:${path[1].lat}:${path[1].lng}`}
          path={path}
          strokeColor={color}
          strokeOpacity={0}
          strokeWeight={selected ? 4 : 3}
          icons={[
            {
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: color,
                fillOpacity: opacity,
                strokeColor: color,
                strokeOpacity: opacity,
                strokeWeight: 1,
                scale: selected ? 2.4 : 2,
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
  const strokeColor = selected ? "#f59e0b" : "#7dd3fc";
  const strokeOpacity = selected ? 1 : hasSelection ? 0.28 : 0.85;
  const strokeWeight = selected ? 7 : 4;

  if (!isLegacyLegMode(mode) && selectedRoute?.polyline) {
    // Real road/rail-following route from the Routes API - what "the
    // route between stops" actually means once a server key exists.
    return (
      <>
        <Polyline
          encodedPath={selectedRoute.polyline}
          strokeColor={strokeColor}
          strokeOpacity={strokeOpacity}
          strokeWeight={strokeWeight}
          icons={selected ? [] : ARROW_ICONS}
          onClick={onSelect}
        />
        <RouteAccessConnectors
          encodedPath={selectedRoute.polyline}
          from={from}
          to={to}
          selected={selected}
          hasSelection={hasSelection}
          onSelect={onSelect}
        />
      </>
    );
  }

  // No key yet, or this leg hasn't resolved: a straight dashed line is
  // still a useful "you go this way next" cue as long as both ends have
  // coordinates, and it upgrades to the real route with no code change
  // once the leg above returns data.
  if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) return null;
  return (
    <Polyline
      path={[
        { lat: from.lat, lng: from.lng },
        { lat: to.lat, lng: to.lng },
      ]}
      strokeColor={strokeColor}
      strokeOpacity={selected ? 1 : hasSelection ? 0.2 : 0.7}
      strokeWeight={strokeWeight}
      icons={isLegacyLegMode(mode) || selected ? [] : [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.6, scale: 3 }, offset: "0", repeat: "10px" }]}
      onClick={onSelect}
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
