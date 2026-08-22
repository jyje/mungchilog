import { Component, type ReactNode } from "react";
import { Map } from "@vis.gl/react-google-maps";
import type { TripSummary } from "../types";

type CoverSpot = NonNullable<NonNullable<TripSummary["cover"]>["spot"]>;

class CoverMapFailureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <div className="trip-cover-map-fallback">지도를 표시할 수 없습니다.</div>;
    return this.props.children;
  }
}

export function TripCoverMap({ spot }: { spot: CoverSpot }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey || spot.lat == null || spot.lng == null) {
    return <div className="trip-cover-map-fallback">대표 장소의 지도를 준비 중입니다.</div>;
  }

  return (
    <div className="trip-cover-map" aria-hidden="true">
      <CoverMapFailureBoundary>
        <Map
          defaultCenter={{ lat: spot.lat, lng: spot.lng }}
          defaultZoom={14}
          mapId="mungchilog-trip-cover-map"
          disableDefaultUI
          gestureHandling="none"
          keyboardShortcuts={false}
        />
      </CoverMapFailureBoundary>
    </div>
  );
}
