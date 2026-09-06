import type { LegRoute } from "./api";

// T-map style labels for the alternatives Google (or NAVITIME) already
// returns - no extra API call, just ranking data already on each LegRoute.
// "Prefer major roads" is deliberately not offered here: telling it apart
// from the default route reliably would need a second, differently
// parameterized request per DRIVE leg, which is a real cost/latency
// trade-off left for a future decision rather than guessed at.
export type RouteBadge = "recommended" | "fastest" | "shortest" | "cheapest";

// One badge array per route, same length and order as `routes`. A route can
// carry more than one badge (the fastest alternative is often also the
// recommended one); an index with no badge at all gets an empty array.
export function routeBadges(routes: LegRoute[]): RouteBadge[][] {
  const fastestIndex = indexOfMin(routes, (route) => route.durationS);
  const shortestIndex = indexOfMin(routes, (route) => route.distanceM);
  const cheapestIndex = indexOfCheapest(routes);

  return routes.map((route, index) => {
    const badges: RouteBadge[] = [];
    // Google's own top pick, not "whichever came first in the array" - the
    // array order is not guaranteed stable across a cache refresh, but the
    // label is server-assigned per journey.
    if (route.label === "DEFAULT_ROUTE") badges.push("recommended");
    if (index === fastestIndex) badges.push("fastest");
    if (index === shortestIndex) badges.push("shortest");
    if (index === cheapestIndex) badges.push("cheapest");
    return badges;
  });
}

function indexOfMin(routes: LegRoute[], value: (route: LegRoute) => number | null): number | null {
  let bestIndex: number | null = null;
  let bestValue = Infinity;
  routes.forEach((route, index) => {
    const current = value(route);
    if (current != null && current < bestValue) {
      bestValue = current;
      bestIndex = index;
    }
  });
  return bestIndex;
}

// A "cheapest" badge is only meaningful when fares actually differ - a mode
// with no fare concept (walk, drive without tolls) or every alternative
// sharing one fare would make the badge noise rather than a real choice.
function indexOfCheapest(routes: LegRoute[]): number | null {
  const fares = routes.map((route) => route.fareAmount).filter((fare): fare is number => fare != null);
  const distinctFares = new Set(fares);
  if (distinctFares.size < 2) return null;
  return indexOfMin(routes, (route) => route.fareAmount);
}
