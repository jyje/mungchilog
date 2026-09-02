import type { ItineraryGroup, Spot } from "./types";

export type ItineraryBlock =
  | { kind: "spot"; spot: Spot }
  | { kind: "group"; group: ItineraryGroup; spots: Spot[] };

function contiguousRuns(ids: string[], orderedIds: string[]): string[][] {
  const wanted = new Set(ids);
  const runs: string[][] = [];
  let run: string[] = [];

  for (const id of orderedIds) {
    if (wanted.has(id)) run.push(id);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

// A card can be dragged independently. When that splits a group, retain its
// largest remaining contiguous range and quietly release the moved-out cards.
// This avoids persisting a visual group that is no longer one block.
export function normalizeItineraryGroups(groups: ItineraryGroup[] | undefined, spots: Spot[]): ItineraryGroup[] {
  const orderedIds = spots.map((spot) => spot.id);
  const available = new Set(orderedIds);
  const claimed = new Set<string>();

  return (groups ?? []).flatMap((group) => {
    const ids = group.spotIds.filter((id) => available.has(id) && !claimed.has(id));
    const run = contiguousRuns(ids, orderedIds)
      .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))[0] ?? [];
    if (run.length < 2) return [];
    run.forEach((id) => claimed.add(id));
    return [{ ...group, spotIds: run }];
  });
}

export function itineraryBlocks(spots: Spot[], groups: ItineraryGroup[] | undefined): ItineraryBlock[] {
  const normalized = normalizeItineraryGroups(groups, spots);
  const groupsByFirstSpot = new Map<string, ItineraryGroup>();
  const groupBySpot = new Map<string, ItineraryGroup>();
  for (const group of normalized) {
    groupsByFirstSpot.set(group.spotIds[0], group);
    group.spotIds.forEach((spotId) => groupBySpot.set(spotId, group));
  }

  const blocks: ItineraryBlock[] = [];
  for (const spot of spots) {
    const group = groupBySpot.get(spot.id);
    if (!group) {
      blocks.push({ kind: "spot", spot });
      continue;
    }
    if (!groupsByFirstSpot.has(spot.id)) continue;
    const byId = new Map(spots.map((candidate) => [candidate.id, candidate]));
    blocks.push({ kind: "group", group, spots: group.spotIds.map((spotId) => byId.get(spotId)).filter((candidate): candidate is Spot => !!candidate) });
  }
  return blocks;
}

export function removeSpotFromItineraryGroups(groups: ItineraryGroup[] | undefined, spotId: string): ItineraryGroup[] {
  return (groups ?? []).flatMap((group) => {
    const spotIds = group.spotIds.filter((candidate) => candidate !== spotId);
    return spotIds.length >= 2 ? [{ ...group, spotIds }] : [];
  });
}
