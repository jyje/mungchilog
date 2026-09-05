import { ROUTE_LINE_LEGEND, routeDirectionIcons, routeStrokeLayers } from "@/routeStyles";

// The drawn reference for RouteOverlay's line styles. Every stroke here comes
// from routeStrokeLayers - the same function the map calls - so the legend
// cannot drift from what it documents.
//
// Rendered on a fixed light backdrop rather than the themed card: Google's
// basemap does not follow the app theme, so a white casing has to be judged
// against a map-like ground in both themes.

const WIDTH = 260;
const HEIGHT = 26;
const MID = HEIGHT / 2;
const START = 10;
const END = WIDTH - 22;

function RouteSwatch({ row }: { row: (typeof ROUTE_LINE_LEGEND)[number] }) {
  const { casing, core } = routeStrokeLayers(row);
  const [tick] = routeDirectionIcons({ kind: row.kind, emphasis: row.emphasis });

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      height={HEIGHT}
      role="img"
      aria-label={row.label}
      preserveAspectRatio="xMidYMid meet"
    >
      {casing && (
        <line
          x1={START}
          y1={MID}
          x2={END}
          y2={MID}
          stroke={casing.strokeColor}
          strokeOpacity={casing.strokeOpacity}
          strokeWidth={casing.strokeWeight}
          strokeLinecap="round"
        />
      )}
      <line
        x1={START}
        y1={MID}
        x2={END}
        y2={MID}
        stroke={core.strokeColor}
        strokeOpacity={core.strokeOpacity}
        strokeWidth={core.strokeWeight}
        strokeLinecap="round"
      />
      {tick && (
        // The map repeats a short perpendicular tick along the line via a
        // Google IconSequence. A dashed overlay is not the same primitive, but
        // it reproduces the same rhythm of marks at legend scale.
        <line
          x1={START}
          y1={MID}
          x2={END}
          y2={MID}
          stroke={tick.icon.strokeColor}
          strokeOpacity={tick.icon.strokeOpacity}
          strokeWidth={core.strokeWeight}
          strokeDasharray={`2 ${Math.max(4, parseInt(tick.repeat, 10) - 2)}`}
        />
      )}
      {/* Direction cue. The map draws ticks rather than arrowheads, so this
          chevron stands in for travel direction only at the end of the line. */}
      <path
        d={`M ${END + 3} ${MID - 4} L ${END + 9} ${MID} L ${END + 3} ${MID + 4}`}
        fill="none"
        stroke={core.strokeColor}
        strokeOpacity={core.strokeOpacity}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GalleryRouteLegend() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2" data-route-legend>
      {ROUTE_LINE_LEGEND.map((row) => {
        const { casing, core } = routeStrokeLayers(row);
        return (
          <li
            key={row.id}
            className="rounded-lg border border-[#d8dde3] bg-[#eef1f4] p-3"
            data-route-legend-row={row.id}
            // Echoed as data so a test can assert the resolved style without
            // parsing SVG presentation attributes, which jsdom does not
            // compute reliably.
            data-route-core-color={core.strokeColor}
            data-route-casing={casing ? casing.strokeColor : "none"}
            data-route-core-width={core.strokeWeight}
            data-route-casing-width={casing?.strokeWeight ?? "none"}
          >
            <RouteSwatch row={row} />
            <p className="mt-2 text-sm font-medium text-[#14151a]">{row.label}</p>
            <p className="mt-0.5 text-xs text-[#565c66]">{row.description}</p>
          </li>
        );
      })}
    </ul>
  );
}
