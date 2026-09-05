import { BusFront, TrainFront, TramFront } from "lucide-react";

// Shared by LegInfo (the text summary) and RouteOverlay (the map badge), so
// the vehicle-to-icon mapping can't drift between the two places a rider sees
// it. Neither provider's vehicle vocabulary is exhaustive (see
// route-providers/navitime.ts's VEHICLE_BY_MOVE on the server), so an
// unrecognized value falls through to a plain train - Japan's rail network is
// the safe default guess.
export function TransitVehicleIcon({ vehicle }: { vehicle: string | null | undefined }) {
  const normalized = vehicle?.toUpperCase() ?? "";
  const Icon = normalized.includes("BUS") ? BusFront : normalized.includes("TRAM") ? TramFront : TrainFront;
  return <Icon aria-hidden="true" />;
}
