import { useEffect, useMemo, useRef, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { Route } from "lucide-react";
import type { Spot } from "../types";
import { useDeviceLocation } from "../hooks/useDeviceLocation";
import { useMapViewportInsets } from "./MapViewportContext";
import { panToVisibleCenter } from "./mapCamera";
import { MapIconButton } from "./system/MapIconButton";
import type { ItinerarySelection } from "./TripMap";

type FollowState = "idle" | "following" | "paused";
type FollowLeg = { fromId: string; toId: string } | null;

function chooseLeg(spots: Spot[], selection: ItinerarySelection): FollowLeg {
  const sorted = [...spots].sort((a, b) => a.order - b.order);
  if (sorted.length < 2) return null;
  if (selection?.kind === "leg") return selection;
  if (selection?.kind === "spot") {
    const index = sorted.findIndex((spot) => spot.id === selection.spotId);
    if (index >= 0 && index < sorted.length - 1) return { fromId: sorted[index].id, toId: sorted[index + 1].id };
  }
  return { fromId: sorted[0].id, toId: sorted[1].id };
}

export function ItineraryFollowControl({ spots, selection, onSelect }: {
  spots: Spot[];
  selection: ItinerarySelection;
  onSelect: (selection: Exclude<ItinerarySelection, null>) => void;
}) {
  const map = useMap();
  const insets = useMapViewportInsets();
  const { fix, phase, requestLocation } = useDeviceLocation();
  const [state, setState] = useState<FollowState>("idle");
  const [leg, setLeg] = useState<FollowLeg>(null);
  const stateRef = useRef(state);
  const sorted = useMemo(() => [...spots].sort((a, b) => a.order - b.order), [spots]);
  const hasValidLeg = Boolean(leg && sorted.some((spot) => spot.id === leg.fromId) && sorted.some((spot) => spot.id === leg.toId));
  const visibleState: FollowState = state !== "idle" && !hasValidLeg ? "idle" : state;
  const activeIndex = leg ? sorted.findIndex((spot) => spot.id === leg.toId) : -1;
  const label = visibleState === "following" ? "따라가기 중지" : visibleState === "paused" ? "따라가기 재개" : "따라가기";

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    if (!map || typeof map.addListener !== "function") return;
    const listener = map.addListener("dragstart", () => {
      if (stateRef.current === "following") setState("paused");
    });
    return () => listener.remove();
  }, [map]);
  useEffect(() => {
    if (state !== "following" || !fix || !map) return;
    panToVisibleCenter(map, { lat: fix.lat, lng: fix.lng }, insets);
  }, [state, fix, map, insets]);
  useEffect(() => {
    function dismiss() {
      setState((current) => current === "idle" ? current : "idle");
      setLeg(null);
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
  }, []);
  useEffect(() => {
    if (visibleState !== "following" || !leg) return;
    if (selection && (selection.kind !== "leg" || selection.fromId !== leg.fromId || selection.toId !== leg.toId)) {
      setState("paused");
    }
  }, [leg, selection, visibleState]);

  function toggle() {
    if (visibleState === "following") {
      setState("idle");
      setLeg(null);
      return;
    }
    const next = hasValidLeg ? leg : chooseLeg(sorted, selection);
    if (!next) return;
    setLeg(next);
    onSelect({ kind: "leg", fromId: next.fromId, toId: next.toId });
    setState("following");
    requestLocation();
  }
  function nextStop() {
    if (!leg) return;
    const index = sorted.findIndex((spot) => spot.id === leg.toId);
    if (index < 0 || index >= sorted.length - 1) {
      setState("idle");
      setLeg(null);
      return;
    }
    const next = { fromId: sorted[index].id, toId: sorted[index + 1].id };
    setLeg(next);
    onSelect({ kind: "leg", fromId: next.fromId, toId: next.toId });
  }
  return <div className={`itinerary-follow-control ${visibleState}`}>
    <MapIconButton
      icon={<Route className="size-5" aria-hidden="true" />}
      label={label}
      className={`itinerary-follow-button ${visibleState}`}
      selected={visibleState === "following"}
      disabled={spots.length < 2 || phase === "acquiring"}
      aria-busy={phase === "acquiring"}
      onClick={toggle}
    />
    {visibleState !== "idle" && <div className="itinerary-follow-status" role="status" aria-live="polite">
      <span>{visibleState === "paused" ? "따라가기 일시 정지" : Math.max(1, activeIndex + 1) + "번째 동선 따라가기"}</span>
      <button type="button" onClick={nextStop}>{activeIndex >= sorted.length - 1 ? "완료" : "다음 스팟"}</button>
    </div>}
  </div>;
}
