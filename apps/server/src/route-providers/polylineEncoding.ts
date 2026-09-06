// Encodes a sequence of [longitude, latitude] pairs (GeoJSON LineString
// order, which is what NAVITIME's shape=true response uses) into Google's
// polyline algorithm format - the same encoding routes.googleapis.com
// returns and the only shape apps/web/src/components/RouteOverlay.tsx knows
// how to decode. Keeping this here rather than adding a decode-both-formats
// branch on the client is what lets a NAVITIME route look, to every consumer
// downstream of the provider, exactly like a Google one.
//
// Standard algorithm (no third-party dependency needed):
// https://developers.google.com/maps/documentation/utilities/polylinealgorithm
export function encodeLineStringToPolyline(coordinates: Array<[number, number]>): string {
  let output = "";
  let prevLat = 0;
  let prevLng = 0;

  for (const [lng, lat] of coordinates) {
    const latE5 = Math.round(lat * 1e5);
    const lngE5 = Math.round(lng * 1e5);
    output += encodeSignedNumber(latE5 - prevLat);
    output += encodeSignedNumber(lngE5 - prevLng);
    prevLat = latE5;
    prevLng = lngE5;
  }

  return output;
}

function encodeSignedNumber(value: number): string {
  let shifted = value << 1;
  if (value < 0) shifted = ~shifted;
  return encodeUnsignedNumber(shifted);
}

function encodeUnsignedNumber(value: number): string {
  let output = "";
  let remaining = value;
  while (remaining >= 0x20) {
    output += String.fromCharCode((0x20 | (remaining & 0x1f)) + 63);
    remaining >>= 5;
  }
  output += String.fromCharCode(remaining + 63);
  return output;
}
