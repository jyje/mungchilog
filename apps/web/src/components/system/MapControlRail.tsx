import { Children, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMapViewportInsets } from "../MapViewportContext";
import { chooseMapControlRail, type ControlRect, type MapControlRailPlacement } from "../mapControlGeometry";
import "./map-control-rail.css";

type MapControlRailProps = {
  children: ReactNode;
  className?: string;
};

const NATIVE_CONTROL_SELECTOR = [
  ".gm-style-mtc",
  ".gm-control-active",
  ".gm-svpc",
  ".gm-style-cc",
  '[aria-label="키보드 단축키"]',
].join(",");

const CONTROL_SIZE = { width: 44, height: 44 };
const CONTROL_GAP = 12;
const CONTROL_EDGE_GAP = 12;

function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}

function nativeControlRects(container: HTMLElement): ControlRect[] {
  const mapRect = container.getBoundingClientRect();
  return Array.from(container.querySelectorAll<HTMLElement>(NATIVE_CONTROL_SELECTOR))
    .filter(isVisible)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - mapRect.left,
        top: rect.top - mapRect.top,
        right: rect.right - mapRect.left,
        bottom: rect.bottom - mapRect.top,
      };
    });
}

function samePlacement(first: MapControlRailPlacement | null, second: MapControlRailPlacement | null) {
  if (first?.side !== second?.side) return false;
  if (!first || !second) return first === second;
  return ["left", "top", "right", "bottom"].every((edge) => first.rect[edge as keyof ControlRect] === second.rect[edge as keyof ControlRect]);
}

/**
 * Shared placement contract for controls owned by Mungchilog. Google Maps
 * keeps its own control rail, so this rail reserves the conservative gutter
 * beside it and gives each app action one stable vertical column.
 */
export function MapControlRail({ children, className = "" }: MapControlRailProps) {
  const insets = useMapViewportInsets();
  const railRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<MapControlRailPlacement | null>(null);
  const itemCount = Children.count(children);

  useLayoutEffect(() => {
    const rail = railRef.current;
    const container = rail ? rail.closest<HTMLElement>(".map-container") : null;
    if (!container) return;
    const mapContainer: HTMLElement = container;

    function measure() {
      const bounds = mapContainer.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const railBounds = rail?.getBoundingClientRect();
      const hasMeasuredRail = Boolean(railBounds?.width && railBounds.height);
      const next = chooseMapControlRail(
        { width: bounds.width, height: bounds.height, insets },
        {
          // A status callout can make one child wider and taller than the
          // icon buttons. Use the rendered rail as one measured rectangle so
          // the full callout, not just its trigger, participates in collision
          // avoidance. The fallback keeps the first pass deterministic in
          // environments that do not expose layout boxes yet.
          itemCount: hasMeasuredRail ? 1 : itemCount,
          controlSize: hasMeasuredRail ? { width: Math.max(CONTROL_SIZE.width, railBounds!.width), height: Math.max(CONTROL_SIZE.height, railBounds!.height) } : CONTROL_SIZE,
          gap: CONTROL_GAP,
          edgeGap: CONTROL_EDGE_GAP,
          exclusions: nativeControlRects(mapContainer),
        },
      );
      setPlacement((current) => samePlacement(current, next) ? current : next);
    }

    measure();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resizeObserver?.observe(mapContainer);
    if (rail) resizeObserver?.observe(rail);
    const mutationObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(measure);
    mutationObserver?.observe(mapContainer, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "aria-label"] });
    window.addEventListener("resize", measure);
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [insets, itemCount]);

  const style = {
    "--map-control-right": `${insets.right}px`,
    "--map-control-bottom": `${insets.bottom}px`,
    "--map-control-left": `${insets.left}px`,
    ...(placement ? {
      left: `${placement.rect.left}px`,
      top: `${placement.rect.top}px`,
      right: "auto",
      bottom: "auto",
    } : {}),
  } as CSSProperties;
  return (
    <div ref={railRef} className={`map-control-rail${className ? ` ${className}` : ""}`} data-placement={placement?.side ?? "fallback"} style={style} role="group" aria-label="지도 도구">
      {children}
    </div>
  );
}
