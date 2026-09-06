import { describe, expect, test } from "vitest";
import { routeBadges } from "../src/routeChoices";
import type { LegRoute } from "../src/api";

function route(overrides: Partial<LegRoute>): LegRoute {
  return {
    distanceM: null,
    durationS: null,
    fareAmount: null,
    fareCurrency: null,
    polyline: null,
    label: "DEFAULT_ROUTE_ALTERNATE",
    key: "k",
    ...overrides,
  };
}

describe("routeBadges", () => {
  test("recommended follows Google's own label, not array position", () => {
    const routes = [
      route({ key: "a", label: "DEFAULT_ROUTE_ALTERNATE" }),
      route({ key: "b", label: "DEFAULT_ROUTE" }),
    ];
    const badges = routeBadges(routes);
    expect(badges[0]).not.toContain("recommended");
    expect(badges[1]).toContain("recommended");
  });

  test("fastest is the route with the lowest duration", () => {
    const routes = [route({ key: "a", durationS: 900 }), route({ key: "b", durationS: 600 })];
    expect(routeBadges(routes)[1]).toContain("fastest");
    expect(routeBadges(routes)[0]).not.toContain("fastest");
  });

  test("shortest is the route with the lowest distance", () => {
    const routes = [route({ key: "a", distanceM: 5000 }), route({ key: "b", distanceM: 3000 })];
    expect(routeBadges(routes)[1]).toContain("shortest");
    expect(routeBadges(routes)[0]).not.toContain("shortest");
  });

  test("cheapest only appears when at least two routes have differing fares", () => {
    const sameFare = [route({ key: "a", fareAmount: 1500 }), route({ key: "b", fareAmount: 1500 })];
    expect(routeBadges(sameFare).flat()).not.toContain("cheapest");

    const noFare = [route({ key: "a" }), route({ key: "b" })];
    expect(routeBadges(noFare).flat()).not.toContain("cheapest");

    const oneFare = [route({ key: "a", fareAmount: 1500 }), route({ key: "b" })];
    expect(routeBadges(oneFare).flat()).not.toContain("cheapest");

    const differingFares = [route({ key: "a", fareAmount: 1500 }), route({ key: "b", fareAmount: 1200 })];
    expect(routeBadges(differingFares)[1]).toContain("cheapest");
    expect(routeBadges(differingFares)[0]).not.toContain("cheapest");
  });

  test("a route can carry more than one badge", () => {
    const routes = [route({ key: "a", label: "DEFAULT_ROUTE", durationS: 600, distanceM: 1000, fareAmount: 1200 }), route({ key: "b", durationS: 900, distanceM: 2000, fareAmount: 1500 })];
    expect(routeBadges(routes)[0]).toEqual(expect.arrayContaining(["recommended", "fastest", "shortest", "cheapest"]));
  });

  test("ties resolve to the first matching route", () => {
    const routes = [route({ key: "a", durationS: 600 }), route({ key: "b", durationS: 600 })];
    expect(routeBadges(routes)[0]).toContain("fastest");
    expect(routeBadges(routes)[1]).not.toContain("fastest");
  });

  test("an empty or single-route list never throws", () => {
    expect(routeBadges([])).toEqual([]);
    expect(routeBadges([route({ key: "a" })])).toEqual([[]]);
  });
});
