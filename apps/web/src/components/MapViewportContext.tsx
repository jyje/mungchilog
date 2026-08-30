import { createContext, useContext, type ReactNode } from "react";

/** Insets are relative to the map element, not the full browser window. */
export type MapViewportInsets = { top: number; right: number; bottom: number; left: number };

const MapViewportContext = createContext<MapViewportInsets>({ top: 0, right: 0, bottom: 0, left: 0 });

export function MapViewportProvider({ value, children }: { value: MapViewportInsets; children: ReactNode }) {
  return <MapViewportContext.Provider value={value}>{children}</MapViewportContext.Provider>;
}

// The provider and its consumer share one public map-layout contract.
// oxlint-disable-next-line react/only-export-components
export function useMapViewportInsets() {
  return useContext(MapViewportContext);
}
