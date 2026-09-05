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

  it.each(MAP_VIEWPORT_FIXTURES)("avoids a representative Google control set at $name", (fixture) => {
    const nativeControls = [
      { left: fixture.width - 50, top: 80, right: fixture.width, bottom: 120 },
      { left: fixture.width - 50, top: 132, right: fixture.width, bottom: 172 },
      { left: Math.max(0, fixture.width - 300), top: fixture.height - 16, right: fixture.width, bottom: fixture.height },
    ];
    const placement = chooseMapControlRail(fixture, {
      itemCount: 2,
      controlSize: { width: 44, height: 44 },
      gap: 12,
      edgeGap: 12,
      exclusions: nativeControls,
    });

    expect(placement, fixture.name).not.toBeNull();
    expect(nativeControls.every((control) => !rectsIntersect(placement!.rect, control, 12)), fixture.name).toBe(true);
  });

  it("moves the rail inward before lifting it above a native lower-right control cluster", () => {
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
      rect: { left: 204, top: 680, right: 252, bottom: 788 },
    });
    expect(rectsIntersect(placement!.rect, nativeLowerRight, 12)).toBe(false);
  });

  it("keeps a right-side rail clear when native controls span the map edge", () => {
    const viewport = { width: 1280, height: 418 };
    const nativeControls = [
      { left: 1230, top: 282, right: 1270, bottom: 322 },
      { left: 1230, top: 354, right: 1270, bottom: 394 },
      { left: 1025, top: 404, right: 1270, bottom: 418 },
    ];
    const placement = chooseMapControlRail(viewport, {
      itemCount: 2,
      controlSize: { width: 44, height: 44 },
      gap: 12,
      edgeGap: 12,
      exclusions: nativeControls,
    });

    expect(placement?.side).toBe("right");
    expect(placement?.rect).toEqual({ left: 957, top: 306, right: 1001, bottom: 406 });
    expect(nativeControls.every((control) => !rectsIntersect(placement!.rect, control, 12))).toBe(true);
  });

  it("keeps the rail at the lower map edge when a bottom panel leaves a short map", () => {
    const shortMap = { width: 390, height: 400 };
    const nativeLowerRight = { left: 320, top: 188, right: 390, bottom: 400 };
    const placement = chooseMapControlRail(shortMap, {
      itemCount: 2,
      controlSize,
      gap: 12,
      edgeGap: 12,
      exclusions: [nativeLowerRight],
    });

    expect(placement?.rect).toEqual({ left: 248, top: 280, right: 296, bottom: 388 });
    expect(rectsIntersect(placement!.rect, nativeLowerRight, 12)).toBe(false);
  });

  it("shifts inward before using the opposite side when the right rail is occupied", () => {
    const viewport = { width: 390, height: 844 };
    const rightEdge = { left: 320, top: 0, right: 390, bottom: 844 };
    const placement = chooseMapControlRail(viewport, {
      itemCount: 2,
      controlSize,
      exclusions: [rightEdge],
    });

    expect(placement?.side).toBe("right");
    expect(placement?.rect).toEqual({ left: 248, top: 724, right: 296, bottom: 832 });
    expect(rectWithin(placement!.rect, mapContentRect(viewport))).toBe(true);
    expect(rectsIntersect(placement!.rect, rightEdge)).toBe(false);
  });

  it("returns no placement when the visible map cannot fit the rail", () => {
    expect(chooseMapControlRail({ width: 120, height: 120 }, { itemCount: 2, controlSize, gap: 12, edgeGap: 12 })).toBeNull();
    expect(chooseMapControlRail({ width: 360, height: 800, insets: { top: 400, bottom: 400 } }, { itemCount: 2, controlSize })).toBeNull();
  });
});
