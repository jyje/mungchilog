import type { CSSProperties, ReactNode } from "react";
import { useMapViewportInsets } from "../MapViewportContext";
import "./map-control-rail.css";

type MapControlRailProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Shared placement contract for controls owned by Mungchilog. Google Maps
 * keeps its own control rail, so this rail reserves the conservative gutter
 * beside it and gives each app action one stable vertical column.
 */
export function MapControlRail({ children, className = "" }: MapControlRailProps) {
  const insets = useMapViewportInsets();
  const style = {
    "--map-control-right": `${insets.right}px`,
    "--map-control-bottom": `${insets.bottom}px`,
    "--map-control-left": `${insets.left}px`,
  } as CSSProperties;
  return (
    <div className={`map-control-rail${className ? ` ${className}` : ""}`} style={style} role="group" aria-label="지도 도구">
      {children}
    </div>
  );
}
