import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { Route } from "lucide-react";
import type { Spot } from "../types";
import { useDeviceLocation } from "../hooks/useDeviceLocation";
import { useMapViewportInsets } from "./MapViewportContext";
import { panToVisibleCenter } from "./mapCamera";
import { MapIconButton } from "./system/MapIconButton";
import { Button } from "./ui/button";
import type { ItinerarySelection } from "./TripMap";

type FollowState = "idle" | "following" | "paused";
type FollowLeg = { fromId: string; toId: string } | null;

function hasCoordinates(spot: Spot | undefined) {
  return Boolean(spot && Number.isFinite(spot.lat) && Number.isFinite(spot.lng));
}

function sameLeg(selection: ItinerarySelection, leg: Exclude<FollowLeg, null>) {
  return selection?.kind === "leg" && selection.fromId === leg.fromId && selection.toId === leg.toId;
}

function findLeg(spots: Spot[], selection: ItinerarySelection): FollowLeg {
  if (spots.length < 2) return null;
  if (selection?.kind === "leg") return selection;
  if (selection?.kind === "spot") {
    const index = spots.findIndex((spot) => spot.id === selection.spotId);
    if (index >= 0 && index < spots.length - 1) return { fromId: spots[index].id, toId: spots[index + 1].id };
  }
  return { fromId: spots[0].id, toId: spots[1].id };
}

function isLocatedAdjacentLeg(spots: Spot[], leg: FollowLeg) {
  if (!leg) return false;
  const fromIndex = spots.findIndex((spot) => spot.id === leg.fromId);
  const toIndex = spots.findIndex((spot) => spot.id === leg.toId);
  return fromIndex >= 0 && toIndex === fromIndex + 1 && hasCoordinates(spots[fromIndex]) && hasCoordinates(spots[toIndex]);
}

function unavailableMessage(spots: Spot[], selection: ItinerarySelection) {
  const candidate = findLeg(spots, selection);
  if (!candidate) return "두 곳 이상을 일정에 추가하면 따라가기를 사용할 수 있습니다.";
  if (!isLocatedAdjacentLeg(spots, candidate)) return "선택한 동선의 두 장소에 지도 위치가 있어야 따라갈 수 있습니다.";
  return null;
}

function locationMessage(phase: ReturnType<typeof useDeviceLocation>["phase"]) {
  if (phase === "acquiring") return "현재 위치를 확인하고 있습니다.";
  if (phase === "denied") return "위치 권한이 필요합니다. 브라우저 설정에서 허용한 뒤 다시 시도하세요.";
  if (phase === "timeout") return "현재 위치를 확인하지 못했습니다. 다시 시도하세요.";
  if (phase === "unavailable" || phase === "unsupported" || phase === "insecure") return "이 기기에서는 현재 위치를 사용할 수 없습니다.";
  if (phase === "stale") return "현재 위치 갱신이 지연되고 있습니다.";
  if (phase === "paused") return "위치 확인이 멈췄습니다. 다시 시작하면 갱신합니다.";
  return null;
}

export function ItineraryFollowControl({
  spots,
  date,
  selection,
  onSelect,
  onClearSelection,
}: {
  spots: Spot[];
  date: string;
  selection: ItinerarySelection;
  onSelect: (selection: Exclude<ItinerarySelection, null>) => void;
  onClearSelection?: () => void;
}) {
  const map = useMap();
  const insets = useMapViewportInsets();
  const { fix, phase, requestLocation } = useDeviceLocation();
  const [state, setState] = useState<FollowState>("idle");
  const [leg, setLeg] = useState<FollowLeg>(null);
  const stateRef = useRef(state);
  const hadMatchingSelection = useRef(false);
  const previousDate = useRef(date);
  const unavailableId = useId();
  const sorted = useMemo(() => [...spots].sort((a, b) => a.order - b.order), [spots]);
  const hasValidLeg = isLocatedAdjacentLeg(sorted, leg);
  const visibleState: FollowState = state !== "idle" && !hasValidLeg ? "idle" : state;
  const activeIndex = leg ? sorted.findIndex((spot) => spot.id === leg.toId) : -1;
  const activeFrom = leg ? sorted.find((spot) => spot.id === leg.fromId) : null;
  const activeTo = leg ? sorted.find((spot) => spot.id === leg.toId) : null;
  const unavailable = unavailableMessage(sorted, selection);
  const label = visibleState === "following" ? "따라가기 중지" : visibleState === "paused" ? "따라가기 재개" : "따라가기";
  const statusMessage = locationMessage(phase);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!leg || hasValidLeg) return;
    // oxlint-disable-next-line react/set-state-in-effect -- a deleted or reordered active leg must synchronously leave no stale local follow state.
    setState("idle");
    setLeg(null);
    hadMatchingSelection.current = false;
    if (sameLeg(selection, leg)) onClearSelection?.();
  }, [hasValidLeg, leg, onClearSelection, selection]);

  useEffect(() => {
    if (previousDate.current === date) return;
    previousDate.current = date;
    if (stateRef.current === "idle") return;
    // oxlint-disable-next-line react/set-state-in-effect -- an external day switch deliberately terminates the local follow session.
    setState("idle");
    setLeg(null);
    hadMatchingSelection.current = false;
    onClearSelection?.();
  }, [date, onClearSelection]);

  useEffect(() => {
    if (!map || typeof map.addListener !== "function") return;
    const pause = () => {
      if (stateRef.current === "following") setState("paused");
    };
    const dragListener = map.addListener("dragstart", pause);
    const mapElement = map.getDiv?.();
    const onPointerDown = (event: Event) => {
      if ((event.target as Element | null)?.closest(".map-control-rail")) return;
      pause();
    };
    mapElement?.addEventListener("pointerdown", onPointerDown);
    mapElement?.addEventListener("wheel", onPointerDown, { passive: true });
    return () => {
      dragListener.remove();
      mapElement?.removeEventListener("pointerdown", onPointerDown);
      mapElement?.removeEventListener("wheel", onPointerDown);
    };
  }, [map]);

  useEffect(() => {
    if (visibleState !== "following" || !fix || !map) return;
    panToVisibleCenter(map, { lat: fix.lat, lng: fix.lng }, insets);
  }, [visibleState, fix, map, insets]);

  useEffect(() => {
    function dismiss() {
      if (stateRef.current === "idle") return;
      setState("idle");
      setLeg(null);
      hadMatchingSelection.current = false;
      onClearSelection?.();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", dismiss);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", dismiss);
    };
  }, [onClearSelection]);

  useEffect(() => {
    if (visibleState !== "following" || !leg) return;
    if (sameLeg(selection, leg)) {
      hadMatchingSelection.current = true;
      return;
    }
    if (!selection && !hadMatchingSelection.current) return;
    setState("paused");
  }, [leg, selection, visibleState]);

  function selectLeg(next: Exclude<FollowLeg, null>) {
    if (!sameLeg(selection, next)) onSelect({ kind: "leg", fromId: next.fromId, toId: next.toId });
  }

  function toggle() {
    if (visibleState === "following") {
      setState("idle");
      setLeg(null);
      hadMatchingSelection.current = false;
      return;
    }
    const next = hasValidLeg ? leg : findLeg(sorted, selection);
    if (!next || !isLocatedAdjacentLeg(sorted, next)) return;
    setLeg(next);
    hadMatchingSelection.current = sameLeg(selection, next);
    selectLeg(next);
    setState("following");
    requestLocation();
  }

  function nextStop() {
    if (!leg) return;
    const index = sorted.findIndex((spot) => spot.id === leg.toId);
    if (index < 0 || index >= sorted.length - 1) {
      setState("idle");
      setLeg(null);
      hadMatchingSelection.current = false;
      return;
    }
    const next = { fromId: sorted[index].id, toId: sorted[index + 1].id };
    if (!isLocatedAdjacentLeg(sorted, next)) {
      setState("paused");
      return;
    }
    setLeg(next);
    hadMatchingSelection.current = sameLeg(selection, next);
    selectLeg(next);
  }

  return <div className={`itinerary-follow-control ${visibleState}`}>
    <MapIconButton
      icon={<Route className="size-5" aria-hidden="true" />}
      label={label}
      className={`itinerary-follow-button ${visibleState}`}
      selected={visibleState === "following"}
      disabled={Boolean(unavailable)}
      aria-busy={visibleState !== "idle" && phase === "acquiring"}
      aria-describedby={unavailable ? unavailableId : undefined}
      data-follow-state={visibleState}
      onClick={toggle}
    />
    {unavailable && <p id={unavailableId} className="itinerary-follow-unavailable" role="status">{unavailable}</p>}
    {visibleState !== "idle" && <div className="itinerary-follow-status" role="status" aria-live="polite">
      <div className="itinerary-follow-progress">
        <strong>{visibleState === "paused" ? "따라가기 일시 정지" : `${Math.max(1, activeIndex + 1)}번째 동선 따라가기`}</strong>
        {activeFrom && activeTo && <span>{activeFrom.name}에서 {activeTo.name}(으)로</span>}
        {statusMessage && <span className="itinerary-follow-message">{statusMessage}</span>}
      </div>
      <Button type="button" variant="ghost" onClick={nextStop}>{activeIndex >= sorted.length - 1 ? "완료" : "다음 스팟"}</Button>
    </div>}
  </div>;
}
