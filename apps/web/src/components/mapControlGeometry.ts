import type { MapViewportInsets } from "./MapViewportContext";

/** A DOMRect-like rectangle with no browser dependency. */
export type ControlRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ControlSize = { width: number; height: number };

export type MapControlViewport = {
  width: number;
  height: number;
  insets?: Partial<MapViewportInsets>;
};

export type MapControlRailPlacement = {
  side: "left" | "right";
  rect: ControlRect;
};

export type MapControlRailOptions = {
  itemCount: number;
  controlSize: ControlSize;
  gap?: number;
  edgeGap?: number;
  exclusions?: ControlRect[];
};

/** Viewports used by the design review and the responsive smoke tests. */
export const MAP_VIEWPORT_FIXTURES = [
  { name: "small-phone", width: 360, height: 800 },
  { name: "large-phone", width: 390, height: 844 },
  { name: "tall-phone", width: 412, height: 915 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "desktop-browser", width: 1142, height: 1119 },
  { name: "desktop-wide", width: 1440, height: 900 },
] as const;

export type MapViewportFixture = (typeof MAP_VIEWPORT_FIXTURES)[number];

function nonNegative(value: number) {
  return Math.max(0, value);
}

export function rectWidth(rect: ControlRect) {
  return Math.max(0, rect.right - rect.left);
}

export function rectHeight(rect: ControlRect) {
  return Math.max(0, rect.bottom - rect.top);
}

/** Return the map area remaining after the app-owned layout insets. */
export function mapContentRect({ width, height, insets = {} }: MapControlViewport): ControlRect {
  const left = nonNegative(insets.left ?? 0);
  const top = nonNegative(insets.top ?? 0);
  const right = Math.max(left, width - nonNegative(insets.right ?? 0));
  const bottom = Math.max(top, height - nonNegative(insets.bottom ?? 0));
  return { left, top, right, bottom };
}

/** Expand a rectangle by a collision gap on every side. */
export function expandRect(rect: ControlRect, gap: number): ControlRect {
  const amount = nonNegative(gap);
  return {
    left: rect.left - amount,
    top: rect.top - amount,
    right: rect.right + amount,
    bottom: rect.bottom + amount,
  };
}

/** Edges that only touch are safe. A positive gap reserves breathing room. */
export function rectsIntersect(first: ControlRect, second: ControlRect, gap = 0) {
  const a = expandRect(first, gap);
  const b = expandRect(second, gap);
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function rectWithin(inner: ControlRect, outer: ControlRect) {
  return inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom;
}

export function verticalRailRect(
  content: ControlRect,
  side: "left" | "right",
  itemCount: number,
  controlSize: ControlSize,
  gap = 12,
  edgeGap = 12,
): ControlRect {
  const width = nonNegative(controlSize.width);
  const height = nonNegative(controlSize.height);
  const count = Math.max(0, Math.floor(itemCount));
  const safeGap = nonNegative(gap);
  const safeEdgeGap = nonNegative(edgeGap);
  const totalHeight = count === 0 ? 0 : height * count + safeGap * (count - 1);
  const top = Math.max(content.top, content.bottom - safeEdgeGap - totalHeight);
  const left = side === "left" ? content.left + safeEdgeGap : content.right - safeEdgeGap - width;
  return { left, top, right: left + width, bottom: top + totalHeight };
}

/**
 * Pick one vertical app-control rail that stays inside the visible map and
 * does not collide with measured native controls or other app exclusions.
 * Candidate order is intentional: keep the familiar lower-right rail when
 * it is safe, then prefer the right edge before falling back to the left.
 */
export function chooseMapControlRail(
  viewport: MapControlViewport,
  { itemCount, controlSize, gap = 12, edgeGap = 12, exclusions = [] }: MapControlRailOptions,
): MapControlRailPlacement | null {
  const content = mapContentRect(viewport);
  const count = Math.max(0, Math.floor(itemCount));
  const width = Math.max(0, controlSize.width);
  const height = Math.max(0, controlSize.height);
  const safeGap = Math.max(0, gap);
  const safeEdgeGap = Math.max(0, edgeGap);
  const totalHeight = count * height + Math.max(0, count - 1) * safeGap;
  if (rectWidth(content) < width + safeEdgeGap * 2 || rectHeight(content) < totalHeight + safeEdgeGap * 2) return null;

  const sides: Array<"right" | "left"> = ["right", "left"];
  const placements = sides.flatMap((side) => {
    const baseLeft = side === "left" ? content.left + safeEdgeGap : content.right - safeEdgeGap - width;
    const leftCandidates = [
      baseLeft,
      // A native control can occupy the edge without occupying the whole
      // map. Try the nearest clear column before abandoning this side.
      ...exclusions.flatMap((exclusion) => [
        exclusion.left - width - safeEdgeGap * 2,
        exclusion.right + safeEdgeGap * 2,
      ]),
    ];
    const bottomTop = content.bottom - safeEdgeGap - totalHeight;
    const middleTop = Math.max(content.top + safeEdgeGap, content.top + (rectHeight(content) - totalHeight) / 2);
    const topCandidates = [
      bottomTop,
      middleTop,
      ...exclusions.flatMap((exclusion) => [
        exclusion.top - totalHeight - safeEdgeGap * 2,
        exclusion.bottom + safeEdgeGap * 2,
      ]),
    ];
    return leftCandidates.flatMap((left) => topCandidates.map((top) => ({
      side,
      rect: { left, top, right: left + width, bottom: top + totalHeight },
    })));
  });

  return placements.find(({ rect }) => rectWithin(rect, content) && !exclusions.some((exclusion) => rectsIntersect(rect, exclusion, edgeGap))) ?? null;
}
