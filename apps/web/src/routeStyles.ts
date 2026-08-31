import { LEG_MODE_OPTIONS } from "./legPreferences";
import type { PersistedLegMode } from "./types";

// How a route line is drawn, kept apart from the map component so the
// decisions are testable: RouteOverlay needs a live Google map, this does not.
//
// Nothing here may touch `google.*` at module scope - the icon `path` values
// are plain SVG path strings for exactly that reason. Importing a
// `google.maps.SymbolPath` constant would break every test that loads this
// module under jsdom, where no Maps API exists.

/** What a drawn piece of route means, independent of provider vocabulary. */
export type RouteSegmentKind = "RIDE" | "WALK";

/** How much attention this piece deserves right now. */
export type RouteEmphasis = "selected" | "default" | "dimmed";

/** A structural subset of google.maps.PolylineOptions. */
export type RouteStroke = {
  strokeColor: string;
  strokeOpacity: number;
  strokeWeight: number;
  zIndex: number;
};

/** `casing: null` means the casing is deliberately omitted, not missing. */
export type RouteStrokeLayers = {
  casing: RouteStroke | null;
  core: RouteStroke;
};

// Hardcoded hex, not var(--accent): the Maps JS API cannot resolve CSS custom
// properties, and the route has to stay legible against Google's basemap,
// which does not follow the app's theme.
export const ROUTE_LINE_COLORS = {
  // Google's default water sits near #aadaff (L* ~85). This is L* ~52, a wide
  // enough gap that the line reads as drawn rather than as another waterway.
  // It is also the app's own light-theme accent, so map and UI agree.
  ride: "#0284c7",
  // ~90 degrees of hue from the ride blue, and far darker than Google's pale
  // parks. Emerald (#10b981) was rejected: it reads teal next to the blue.
  walk: "#16a34a",
  casing: "#ffffff",
  // Selection colour. Applied to the casing rather than the core, so the
  // mode colour survives on the leg the user is looking at.
  selected: "#f59e0b",
  // A straight legacy-DIRECT line is not a route; route blue would overstate it.
  fallback: "#94a3b8",
} as const;

/**
 * Google reports a per-step `travelMode` for transit journeys, which is the
 * only way to tell the walk to the station from the ride. It wins when
 * present; otherwise the leg's own mode decides.
 */
export function routeSegmentKind(mode: PersistedLegMode, stepTravelMode?: string | null): RouteSegmentKind {
  if (stepTravelMode) return stepTravelMode === "WALK" ? "WALK" : "RIDE";
  return mode === "WALK" ? "WALK" : "RIDE";
}

export function routeEmphasis(selected: boolean, hasSelection: boolean): RouteEmphasis {
  if (selected) return "selected";
  return hasSelection ? "dimmed" : "default";
}

// zIndex bands. Polylines are never given a zIndex today, so ordering across
// legs is currently undefined; casing must sit under its own core, and the
// selected leg above every unselected one.
const Z = {
  dimmedCasing: 4,
  dimmedCore: 5,
  defaultCasing: 10,
  defaultCore: 20,
  selectedCasing: 30,
  selectedCore: 40,
  /** Access connectors ride above everything - they are the easiest to lose. */
  connector: 50,
} as const;

export function routeStrokeLayers(input: {
  kind: RouteSegmentKind;
  emphasis: RouteEmphasis;
  fallback?: boolean;
}): RouteStrokeLayers {
  const color = input.fallback
    ? ROUTE_LINE_COLORS.fallback
    : input.kind === "WALK"
      ? ROUTE_LINE_COLORS.walk
      : ROUTE_LINE_COLORS.ride;

  if (input.emphasis === "dimmed") {
    // No casing on purpose. White at low opacity over Google's near-white land
    // both disappears and washes out the core where they overlap, leaving a
    // muddy pale band. Thinness and a low zIndex carry the de-emphasis
    // instead, and the core keeps more opacity than it did with a casing.
    return {
      casing: null,
      core: { strokeColor: color, strokeOpacity: 0.4, strokeWeight: 3, zIndex: Z.dimmedCore },
    };
  }

  if (input.emphasis === "selected") {
    return {
      casing: { strokeColor: ROUTE_LINE_COLORS.selected, strokeOpacity: 1, strokeWeight: 11, zIndex: Z.selectedCasing },
      core: { strokeColor: color, strokeOpacity: 1, strokeWeight: 6, zIndex: Z.selectedCore },
    };
  }

  // Casing-to-core stays near 1.75x, about 1.5px of white per side. Below 1.5x
  // the casing vanishes when zoomed out; above 2x the route looks like a fat
  // white worm when zoomed in.
  return input.fallback
    ? {
        casing: { strokeColor: ROUTE_LINE_COLORS.casing, strokeOpacity: 0.8, strokeWeight: 5, zIndex: Z.defaultCasing },
        core: { strokeColor: color, strokeOpacity: 0.75, strokeWeight: 3, zIndex: Z.defaultCore },
      }
    : {
        casing: { strokeColor: ROUTE_LINE_COLORS.casing, strokeOpacity: 0.9, strokeWeight: 7, zIndex: Z.defaultCasing },
        core: { strokeColor: color, strokeOpacity: 1, strokeWeight: 4, zIndex: Z.defaultCore },
      };
}

export function connectorStroke(emphasis: RouteEmphasis): { strokeColor: string; strokeOpacity: number; strokeWeight: number; zIndex: number } {
  return {
    strokeColor: emphasis === "selected" ? ROUTE_LINE_COLORS.selected : ROUTE_LINE_COLORS.ride,
    strokeOpacity: emphasis === "selected" ? 1 : emphasis === "dimmed" ? 0.4 : 0.85,
    strokeWeight: emphasis === "selected" ? 4 : 3,
    zIndex: Z.connector,
  };
}

export type RouteDirectionIcon = {
  icon: { path: string; strokeColor?: string; strokeOpacity: number; scale: number };
  offset: string;
  repeat: string;
};

/**
 * The repeated perpendicular ticks that show direction of travel along a line.
 * A selected leg gets none: it is already thick and amber-cased, and ticks on
 * top of that read as noise.
 */
export function routeDirectionIcons(input: { kind: RouteSegmentKind; emphasis: RouteEmphasis }): RouteDirectionIcon[] {
  if (input.emphasis === "selected") return [];
  const dense = input.kind === "WALK";
  return [
    {
      icon: {
        path: "M 0,-1 0,1",
        strokeColor: ROUTE_LINE_COLORS.casing,
        strokeOpacity: input.emphasis === "dimmed" ? 0.5 : 0.9,
        scale: dense ? 2 : 3,
      },
      offset: "0",
      // A tighter rhythm on foot segments so they read as a dotted path even
      // before the colour registers.
      repeat: dense ? "8px" : "12px",
    },
  ];
}

const modeLabel = (mode: PersistedLegMode) => LEG_MODE_OPTIONS.find((option) => option.mode === mode)?.label ?? "";

/**
 * Drives both the gallery legend and its tests, so the documented styles
 * cannot drift from the drawn ones. Labels are reused from LEG_MODE_OPTIONS
 * for the same reason.
 */
export const ROUTE_LINE_LEGEND: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  kind: RouteSegmentKind;
  emphasis: RouteEmphasis;
  fallback?: boolean;
}> = [
  {
    id: "transit-ride",
    label: `${modeLabel("TRANSIT")} · 탑승 구간`,
    description: "차량에 타고 이동하는 구간입니다.",
    kind: "RIDE",
    emphasis: "default",
  },
  {
    id: "transit-walk",
    label: `${modeLabel("TRANSIT")} · 도보 구간`,
    description: "정류장까지 걷거나 환승하며 걷는 구간입니다.",
    kind: "WALK",
    emphasis: "default",
  },
  {
    id: "walk-leg",
    label: `${modeLabel("WALK")} 전체 구간`,
    description: "구간 전체를 걷는 동선이며, 위 도보 구간과 같은 색을 씁니다.",
    kind: "WALK",
    emphasis: "default",
  },
  {
    id: "drive-leg",
    label: `${modeLabel("DRIVE")} 경로`,
    description: "도로를 따라가는 동선입니다.",
    kind: "RIDE",
    emphasis: "default",
  },
  {
    id: "selected",
    label: "선택한 동선",
    description: "이동 수단 색은 그대로 두고 주황색 테두리로 표시합니다.",
    kind: "RIDE",
    emphasis: "selected",
  },
  {
    id: "dimmed",
    label: "선택하지 않은 다른 동선",
    description: "흰 테두리 없이 얇고 흐리게 그려 뒤로 물러납니다.",
    kind: "RIDE",
    emphasis: "dimmed",
  },
  {
    id: "fallback",
    label: "경로를 못 받았을 때",
    description: "실제 경로가 아니라 임시 직선 미리보기입니다.",
    kind: "RIDE",
    emphasis: "default",
    fallback: true,
  },
];
