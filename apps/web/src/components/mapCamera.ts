import type { MapViewportInsets } from "./MapViewportContext";

export function framePadding(insets: MapViewportInsets, gap = 32): google.maps.Padding {
  return { top: insets.top + gap, right: insets.right + gap, bottom: insets.bottom + gap, left: insets.left + gap };
}

/** Pan offsets move the camera, so their sign is opposite the visible center. */
export function cameraOffset(insets: MapViewportInsets) {
  return { x: (insets.right - insets.left) / 2, y: (insets.bottom - insets.top) / 2 };
}

export function panToVisibleCenter(map: google.maps.Map, point: google.maps.LatLngLiteral, insets: MapViewportInsets) {
  map.panTo(point);
  const { x, y } = cameraOffset(insets);
  if (x || y) map.panBy(x, y);
}
