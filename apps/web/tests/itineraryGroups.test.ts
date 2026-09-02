import { describe, expect, it } from "vitest";

import { itineraryBlocks, normalizeItineraryGroups, removeSpotFromItineraryGroups } from "../src/itineraryGroups";
import type { ItineraryGroup, Spot } from "../src/types";

const spots = ["first", "second", "third", "fourth"].map((id, order) => ({
  id,
  order,
  name: id,
  items: [],
  bufferMinutes: 10,
})) satisfies Spot[];

const morning: ItineraryGroup = {
  id: "morning",
  name: "오전",
  spotIds: ["second", "third"],
};

describe("itinerary groups", () => {
  it("renders a contiguous named group as one itinerary block", () => {
    expect(itineraryBlocks(spots, [morning])).toMatchObject([
      { kind: "spot", spot: { id: "first" } },
      { kind: "group", group: morning, spots: [{ id: "second" }, { id: "third" }] },
      { kind: "spot", spot: { id: "fourth" } },
    ]);
  });

  it("releases moved-out cards instead of keeping a broken group", () => {
    const reordered = [spots[1], spots[0], spots[2], spots[3]];
    expect(normalizeItineraryGroups([morning], reordered)).toEqual([]);
  });

  it("drops a group when deleting a card leaves fewer than two stops", () => {
    expect(removeSpotFromItineraryGroups([morning], "second")).toEqual([]);
  });
});
