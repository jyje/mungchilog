import { describe, expect, it } from "vitest";
import {
  MAP_VIEWPORT_FIXTURES,
  chooseMapControlRail,
  expandRect,
  mapContentRect,
  rectsIntersect,
  rectWithin,
  verticalRailRect,
} from "../src/components/mapControlGeometry";

const controlSize = { width: 48, height: 48 };

describe("map control geometry", () => {
  it("keeps app insets inside the map and clamps impossible values", () => {
    expect(mapContentRect({ width: 360, height: 800, insets: { top: 88, right: 40, bottom: 160, left: 12 } })).toEqual({
      left: 12,
      top: 88,
      right: 320,
      bottom: 640,
    });
    expect(mapContentRect({ width: 320, height: 200, insets: { left: 400, top: -20, right: 40, bottom: 300 } })).toEqual({
      left: 400,
      top: 0,
      right: 400,
      bottom: 0,
    });
  });

  it("treats touching edges as safe and reserves a positive collision gap", () => {
    const first = { left: 0, top: 0, right: 48, bottom: 48 };
    const second = { left: 48, top: 0, right: 96, bottom: 48 };
    expect(rectsIntersect(first, second)).toBe(false);
    expect(rectsIntersect(first, second, 1)).toBe(true);
    expect(expandRect(first, 4)).toEqual({ left: -4, top: -4, right: 52, bottom: 52 });
  });

  it("builds a predictable vertical rail for any supported viewport", () => {
    for (const fixture of MAP_VIEWPORT_FIXTURES) {
      const content = mapContentRect({ ...fixture, insets: { top: 88, bottom: 152 } });
      const rail = verticalRailRect(content, "right", 2, controlSize, 12, 12);
      expect(rectWithin(rail, content), fixture.name).toBe(true);
      expect(rail.right - rail.left).toBe(controlSize.width);
      expect(rail.bottom - rail.top).toBe(108);
    }
  });

  it("moves the rail away from a native lower-right control cluster", () => {
    const viewport = { width: 360, height: 800 };
    const nativeLowerRight = { left: 276, top: 610, right: 360, bottom: 800 };
    const placement = chooseMapControlRail(viewport, {
      itemCount: 2,
      controlSize,
      gap: 12,
      edgeGap: 12,
      exclusions: [nativeLowerRight],
    });

    expect(placement).toEqual({
      side: "right",
      rect: { left: 300, top: 346, right: 348, bottom: 454 },
    });
    expect(rectsIntersect(placement!.rect, nativeLowerRight, 12)).toBe(false);
  });

  it("falls back to the opposite side when the right rail is occupied", () => {
    const viewport = { width: 390, height: 844 };
    const rightEdge = { left: 320, top: 0, right: 390, bottom: 844 };
    const placement = chooseMapControlRail(viewport, {
      itemCount: 2,
      controlSize,
      exclusions: [rightEdge],
    });

    expect(placement?.side).toBe("left");
    expect(rectWithin(placement!.rect, mapContentRect(viewport))).toBe(true);
    expect(rectsIntersect(placement!.rect, rightEdge)).toBe(false);
  });

  it("returns no placement when the visible map cannot fit the rail", () => {
    expect(chooseMapControlRail({ width: 120, height: 120 }, { itemCount: 2, controlSize, gap: 12, edgeGap: 12 })).toBeNull();
    expect(chooseMapControlRail({ width: 360, height: 800, insets: { top: 400, bottom: 400 } }, { itemCount: 2, controlSize })).toBeNull();
  });
});
