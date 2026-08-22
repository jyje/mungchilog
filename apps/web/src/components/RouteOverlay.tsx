import { Polyline } from "@vis.gl/react-google-maps";
import { useLeg } from "../hooks/useLeg";
import type { Spot } from "../types";
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

function RouteLeg({
  from,
  to,
  date,
  timezone,
  selected,
  hasSelection,
  onSelect,
}: {
  from: Spot;
  to: Spot;
  date: string;
  timezone: string;
  selected: boolean;
  hasSelection: boolean;
  onSelect: () => void;
}) {
  const { data: leg } = useLeg(from, to, date, timezone);
  const strokeColor = selected ? "#f59e0b" : "#7dd3fc";
  const strokeOpacity = selected ? 1 : hasSelection ? 0.28 : 0.85;
  const strokeWeight = selected ? 7 : 4;

  if (leg?.polyline) {
    // Real road/rail-following route from the Routes API - what "the
    // route between stops" actually means once a server key exists.
    return (
      <Polyline
        encodedPath={leg.polyline}
        strokeColor={strokeColor}
        strokeOpacity={strokeOpacity}
        strokeWeight={strokeWeight}
        icons={selected ? [] : ARROW_ICONS}
        onClick={onSelect}
      />
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
      icons={selected ? [] : [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.6, scale: 3 }, offset: "0", repeat: "10px" }]}
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
  selection,
  onSelect,
}: {
  spots: Spot[];
  date: string;
  timezone: string;
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
          selected={selection?.kind === "leg" && selection.fromId === spot.id && selection.toId === sorted[i + 1].id}
          hasSelection={selection !== null}
          onSelect={() => onSelect({ kind: "leg", fromId: spot.id, toId: sorted[i + 1].id })}
        />
      ))}
    </>
  );
}
