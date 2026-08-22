import type { ReactNode } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";

/**
 * Single shared Maps JS bootstrap for a trip day: both the map itself
 * (TripMap) and any Places Autocomplete input (SpotForm) need to sit
 * under one APIProvider to share useMapsLibrary's loader/context.
 *
 * With no key configured, renders children unwrapped - components that
 * touch the Maps JS API (TripMap, PlaceAutocompleteInput) each already
 * degrade gracefully on their own in that case.
 */
export function MapsScope({ children }: { children: ReactNode }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey) return <>{children}</>;
  return <APIProvider apiKey={apiKey}>{children}</APIProvider>;
}
