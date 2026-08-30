import { Radio } from "lucide-react";
import type { TripLocationSharingController } from "../hooks/useTripLocationSharing";
import { MapIconButton } from "./system/MapIconButton";
import { Button } from "./ui/button";

export function LocationSharingMapStatus({
  controller,
  onOpenDetails,
}: {
  controller: TripLocationSharingController;
  onOpenDetails: () => void;
}) {
  if (!controller.localActive && !controller.remoteActive) return null;
  const label = controller.remoteActive
    ? `${controller.remoteOnOtherTrip ? "다른 여행을 다른 기기에서 위치 공유 중" : "다른 기기에서 위치 공유 중"}, ${controller.remaining}`
    : `${controller.starting ? "위치 공유 준비 중" : controller.interrupted ? "위치 공유 일시 중지" : "위치 공유 중"}, ${controller.remaining}`;

  return <div className="location-sharing-map-status">
    <div className="location-sharing-map-pill" role="status">
      <span><Radio aria-hidden="true" />{controller.remoteActive ? controller.remoteOnOtherTrip ? "다른 여행 공유 중" : "다른 기기에서 공유 중" : controller.starting ? "공유 준비 중" : controller.interrupted ? "공유 일시 중지" : "공유 중"} · {controller.remaining}</span>
      {controller.localActive
        ? <Button type="button" variant="ghost" onClick={() => void controller.stopSharing()} disabled={controller.pending}>중지</Button>
        : <Button type="button" variant="ghost" onClick={onOpenDetails}>확인</Button>}
    </div>
    <MapIconButton
      icon={<Radio aria-hidden="true" />}
      label={label}
      selected
      className="location-sharing-map-button"
      onClick={onOpenDetails}
    />
  </div>;
}
