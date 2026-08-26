import { describe, expect, it, vi } from "vitest";
import { cameraOffset, framePadding, panToVisibleCenter } from "../src/components/mapCamera";

describe("unobscured map camera", () => {
  it("pads each covered edge without double counting a docked panel", () => {
    expect(framePadding({ top: 120, right: 0, bottom: 0, left: 0 })).toEqual({ top: 152, right: 32, bottom: 32, left: 32 });
    expect(framePadding({ top: 120, right: 400, bottom: 0, left: 0 }, 48)).toEqual({ top: 168, right: 448, bottom: 48, left: 48 });
  });
  it("moves the target toward the midpoint of the unobscured rectangle", () => {
    expect(cameraOffset({ top: 120, right: 300, bottom: 40, left: 0 })).toEqual({ x: 150, y: -40 });
    const map = { panTo: vi.fn(), panBy: vi.fn() };
    const point = { lat: 37, lng: 127 };
    panToVisibleCenter(map as unknown as google.maps.Map, point, { top: 120, right: 300, bottom: 40, left: 0 });
    expect(map.panTo).toHaveBeenCalledWith(point);
    expect(map.panBy).toHaveBeenCalledWith(150, -40);
  });
  it("does not introduce movement when no overlay obscures the center", () => {
    const map = { panTo: vi.fn(), panBy: vi.fn() };
    panToVisibleCenter(map as unknown as google.maps.Map, { lat: 0, lng: 0 }, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(map.panBy).not.toHaveBeenCalled();
  });
});
