import { describe, expect, it } from "vitest";
import { waypointForSpot } from "../src/hooks/useLeg";
import type { Spot } from "../src/types";

function spot(overrides: Partial<Spot>): Spot {
  return {
    id: "spot-1",
    order: 0,
    name: "테스트 스팟",
    items: [],
    bufferMinutes: 10,
    ...overrides,
  } as Spot;
}

describe("waypointForSpot", () => {
  it("sends the placeId and the coordinates together for a search-picked spot", () => {
    // This is the case that used to starve NAVITIME: a search-picked spot
    // always has both, and only sending the placeId made every such leg
    // look coordinate-less to the server (see registry.test.ts on the
    // server side for the routing consequence).
    const waypoint = waypointForSpot(spot({ placeId: "ChIJ_abc", lat: 34.7025, lng: 135.4959 }));
    expect(waypoint).toEqual({ placeId: "ChIJ_abc", latLng: { latitude: 34.7025, longitude: 135.4959 } });
  });

  it("a map-dropped stop has only coordinates", () => {
    const waypoint = waypointForSpot(spot({ lat: 34.7025, lng: 135.4959 }));
    expect(waypoint).toEqual({ latLng: { latitude: 34.7025, longitude: 135.4959 } });
  });

  it("a placeId with no resolved coordinates yet is still routable by itself", () => {
    const waypoint = waypointForSpot(spot({ placeId: "ChIJ_abc" }));
    expect(waypoint).toEqual({ placeId: "ChIJ_abc" });
  });

  it("a spot with neither is not routable", () => {
    expect(waypointForSpot(spot({}))).toBeNull();
  });
});
