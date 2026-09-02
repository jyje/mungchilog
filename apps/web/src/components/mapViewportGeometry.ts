import type { MapViewportInsets } from "./MapViewportContext";

type Rect = Pick<DOMRect, "top" | "right" | "bottom" | "left" | "width" | "height">;

const clamp = (value: number, maximum: number) => Math.max(0, Math.min(value, maximum));

/** Pick the largest unobscured rectangle. Docked panes already resize the
 * map, so their dimensions must never be added to its camera padding. */
export function mapViewportInsets(map: Rect, header: Rect, floating?: Rect): MapViewportInsets {
  const top = clamp(header.bottom - map.top + 12, map.height);
  const base = { top, right: 0, bottom: 0, left: 0 };
  if (!floating || floating.right <= map.left || floating.left >= map.right || floating.bottom <= map.top + top || floating.top >= map.bottom) return base;

  const candidates: MapViewportInsets[] = [
    { ...base, right: clamp(map.right - floating.left + 12, map.width) },
    { ...base, left: clamp(floating.right - map.left + 12, map.width) },
    { ...base, top: Math.max(top, clamp(floating.bottom - map.top + 12, map.height)) },
    { ...base, bottom: clamp(map.bottom - floating.top + 12, map.height - top) },
  ];
  const area = (insets: MapViewportInsets) => (map.width - insets.left - insets.right) * (map.height - insets.top - insets.bottom);
  return candidates.reduce((best, candidate) => area(candidate) > area(best) ? candidate : best);
}

export type SheetState = "collapsed" | "intermediate" | "expanded";
export const SHEET_STATES: SheetState[] = ["collapsed", "intermediate", "expanded"];
export const SHEET_LABELS: Record<SheetState, string> = { collapsed: "지도", intermediate: "분할", expanded: "일정" };

// Dragging should keep the height a person chose unless it lands close to an
// intentional endpoint. These are half of the original outer snap ranges:
// 0-25% and 61-100% became 0-12.5% and 80.5-100% respectively.
const COLLAPSED_SNAP_MAX = 0.125;
const EXPANDED_SNAP_MIN = 0.805;

export function closestSheetState(height: number, availableHeight: number): SheetState {
  const ratio = height / Math.max(1, availableHeight);
  if (ratio < COLLAPSED_SNAP_MAX) return "collapsed";
  return ratio < EXPANDED_SNAP_MIN ? "intermediate" : "expanded";
}
