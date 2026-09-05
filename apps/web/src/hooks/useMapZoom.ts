import { useEffect, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";

// The map's current zoom level, kept in React state so a component nested
// anywhere under <Map> can react to it without the top-level <Map> having to
// thread a prop down through every layer in between - useMap() already
// reaches the same map instance from any depth.
export function useMapZoom(): number | null {
  const map = useMap();
  const [zoom, setZoom] = useState<number | null>(() => map?.getZoom() ?? null);

  useEffect(() => {
    if (!map) return;
    setZoom(map.getZoom() ?? null);
    const listener = map.addListener("zoom_changed", () => setZoom(map.getZoom() ?? null));
    return () => listener.remove();
  }, [map]);

  return zoom;
}
