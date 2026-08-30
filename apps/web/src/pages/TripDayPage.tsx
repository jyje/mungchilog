import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MapPinPlus } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { getTrip, saveTrip } from "../api";
import type { Item, Spot, Trip } from "../types";
import { TripMap, type ItinerarySelection, type MapPlaceSelection, type MapPoint } from "../components/TripMap";
import { MapsScope } from "../components/MapsScope";
import { SplitMapShell, type TripPanelActions } from "../components/SplitMapShell";
import { SpotCard } from "../components/SpotCard";
import { LegInfo } from "../components/LegInfo";
import { SpotForm, type SpotFormValues } from "../components/SpotForm";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { TripShareButton } from "../components/TripShareButton";
import { useTripLocationSharing, type SharedLocationWithName } from "../hooks/useTripLocationSharing";
import { TripActionsMenu } from "../components/TripActionsMenu";
import { DateAddSplitButton } from "../components/system/DateAddSplitButton";
import { Button } from "../components/ui/button";
import { legPreferenceFor, removeSpotLegPreferences, replaceLegPreference } from "../legPreferences";
import type { PersistedLegMode } from "../types";
import type { Me } from "../api";
import { downloadTripExchange } from "../tripExchange";
import { PlaceDetailsPanel } from "../components/PlaceDetailsPanel";
import type { PlaceSelection } from "../components/PlaceAutocompleteInput";
import { PlannerPanelTabs, type PlannerPanelTab } from "../components/system/PlannerPanelTabs";
import { scheduleWarnings } from "../schedule";

function nextDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function sortDays<T extends { date: string }>(days: T[]): T[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date));
}

function formatScheduleDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${month}월 ${day}일 (${weekday})`;
}

const SELECTION_HISTORY_KEY = "mungchilog:itinerary-selection";

function removeSelectionHistoryState() {
  const state = (window.history.state ?? {}) as Record<string, unknown>;
  if (!state[SELECTION_HISTORY_KEY]) return;
  const { [SELECTION_HISTORY_KEY]: _selection, ...nextState } = state;
  window.history.replaceState(nextState, "", window.location.href);
}

export function TripDayPage({ id, navigate, me }: { id: string; navigate: (path: string) => void; me: Me }) {
  const qc = useQueryClient();
  const queryKey = ["trip", id];
  const { data: trip, error } = useQuery({ queryKey, queryFn: () => getTrip(id) });
  const [dayIndex, setDayIndex] = useState(0);
  const [addingSpot, setAddingSpot] = useState(false);
  const [dayNoteOpen, setDayNoteOpen] = useState(false);
  const [dateAddOpen, setDateAddOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [dateEditValue, setDateEditValue] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [selection, setSelection] = useState<ItinerarySelection>(null);
  const [sharedLocations, setSharedLocations] = useState<SharedLocationWithName[]>([]);
  const [focusedSharedUserId, setFocusedSharedUserId] = useState<string | null>(null);
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [legSaveError, setLegSaveError] = useState<string | null>(null);
  const [pointPickActive, setPointPickActive] = useState(false);
  const [pendingCoordinate, setPendingCoordinate] = useState<MapPoint | null>(null);
  const [pendingPlace, setPendingPlace] = useState<PlaceSelection | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<MapPlaceSelection | null>(null);
  const [panelTab, setPanelTab] = useState<PlannerPanelTab>("itinerary");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreNextDayClick = useRef(false);
  const focusedSharedUserIdRef = useRef<string | null>(null);
  const previousItinerarySelectionRef = useRef<ItinerarySelection>(null);
  const panelActionsRef = useRef<TripPanelActions | null>(null);

  const setSharedLocationFocus = useCallback((userId: string | null) => {
    focusedSharedUserIdRef.current = userId;
    setFocusedSharedUserId(userId);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    previousItinerarySelectionRef.current = null;
    setSelectedPlace(null);
    setPanelTab("itinerary");
    setSharedLocationFocus(null);
    removeSelectionHistoryState();
  }, [setPanelTab, setSelectedPlace, setSharedLocationFocus]);

  function selectItinerary(next: Exclude<ItinerarySelection, null>) {
    const isSameSelection =
      (selection?.kind === "spot" && next.kind === "spot" && selection.spotId === next.spotId) ||
      (selection?.kind === "leg" &&
        next.kind === "leg" &&
        selection.fromId === next.fromId &&
        selection.toId === next.toId);
    if (isSameSelection) {
      clearSelection();
      return;
    }
    setSharedLocationFocus(null);
    setSelectedPlace(null);
    setPanelTab("itinerary");
    previousItinerarySelectionRef.current = next;
    setSelection(next);
  }

  const selectSharedLocation = useCallback((userId: string | null) => {
    if (!userId || focusedSharedUserIdRef.current === userId) {
      clearSelection();
      return;
    }
    setSelection(null);
    previousItinerarySelectionRef.current = null;
    setSelectedPlace(null);
    setPanelTab("itinerary");
    setSharedLocationFocus(userId);
  }, [clearSelection, setPanelTab, setSelectedPlace, setSharedLocationFocus]);

  const handleSharedLocations = useCallback((locations: SharedLocationWithName[]) => {
    setSharedLocations(locations);
    const focusedUserId = focusedSharedUserIdRef.current;
    if (focusedUserId && !locations.some((location) => location.userId === focusedUserId)) {
      setSharedLocationFocus(null);
      removeSelectionHistoryState();
    }
  }, [setSharedLocationFocus]);
  const locationSharing = useTripLocationSharing({
    tripId: id,
    onLocationsChange: handleSharedLocations,
    onFocus: selectSharedLocation,
  });

  useEffect(() => {
    if (!selection && !focusedSharedUserId && !selectedPlace && !pointPickActive && !addingSpot) return;
    const state = (window.history.state ?? {}) as Record<string, unknown>;
    const nextState = { ...state, [SELECTION_HISTORY_KEY]: true };
    if (state[SELECTION_HISTORY_KEY]) window.history.replaceState(nextState, "", window.location.href);
    else window.history.pushState(nextState, "", window.location.href);
  }, [addingSpot, focusedSharedUserId, pointPickActive, selectedPlace, selection]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || (!selection && !focusedSharedUserId && !selectedPlace && !pointPickActive && !addingSpot)) return;
      event.preventDefault();
      if (pointPickActive || addingSpot) {
        setPointPickActive(false);
        setAddingSpot(false);
        setPendingCoordinate(null);
      }
      clearSelection();
    }
    function onPopState() {
      if (selection || focusedSharedUserId || selectedPlace || pointPickActive || addingSpot) {
        setSelection(null);
        previousItinerarySelectionRef.current = null;
        setSharedLocationFocus(null);
        setPointPickActive(false);
        setAddingSpot(false);
        setPendingCoordinate(null);
        setPendingPlace(null);
        setSelectedPlace(null);
        setPanelTab("itinerary");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onPopState);
    };
  }, [addingSpot, clearSelection, focusedSharedUserId, pointPickActive, selectedPlace, selection, setSharedLocationFocus]);

  const mutation = useMutation({
    mutationFn: (next: Trip) => {
      const { id: tripId, ...data } = next;
      return saveTrip({ id: tripId, ...data });
    },
  });

  // Debounced persist: update the local cache immediately (so the UI
  // never waits on the network) but only hit the server 800ms after the
  // last change, so a drag doesn't fire a save per frame.
  function scheduleSave(next: Trip) {
    qc.setQueryData(queryKey, next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => mutation.mutate(next), 800);
  }

  // Structural edits (add/delete day/spot/item) save immediately - only
  // reorder/checklist-toggle debounce, since those can fire in rapid
  // succession (drag frames, quick double-taps).
  function saveNow(next: Trip) {
    qc.setQueryData(queryKey, next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    mutation.mutate(next);
  }

  if (error) return <p className="error">{String((error as Error).message ?? error)}</p>;
  if (!trip) return <p className="meta">불러오는 중...</p>;

  const day = trip.days[dayIndex];
  const orderedSpots = [...(day?.spots ?? [])].sort((a, b) => a.order - b.order);
  const scheduleWarningBySpotId = new Map(scheduleWarnings(orderedSpots).map((warning) => [warning.spotId, warning.message]));

  function defaultNewDayDate() {
    if (!trip) return "";
    const lastDate = sortDays(trip.days).at(-1)?.date;
    return lastDate ? nextDate(lastDate) : trip.startDate;
  }

  function addDayAt(date: string) {
    if (!trip) return false;
    if (!date) {
      setDateError("날짜를 선택해주세요.");
      return false;
    }
    if (trip.days.some((d) => d.date === date)) {
      setDateError("이미 일정에 추가된 날짜입니다.");
      return false;
    }

    const days = sortDays([...trip.days, { date, spots: [], legPreferences: [] }]);
    const startDate = date < trip.startDate ? date : trip.startDate;
    const endDate = date > trip.endDate ? date : trip.endDate;
    saveNow({ ...trip, startDate, endDate, days });
    setDayIndex(days.findIndex((d) => d.date === date));
    clearSelection();
    setAddingSpot(false);
    setDayNoteOpen(false);
    setDateError(null);
    return true;
  }

  function addDay() {
    addDayAt(defaultNewDayDate());
  }

  function openDateAdd() {
    setCustomDate(defaultNewDayDate());
    setDateError(null);
    setEditingDate(null);
    setDateAddOpen(true);
  }

  function openDateEditor(date: string) {
    setDateAddOpen(false);
    setDateError(null);
    setEditingDate(date);
    setDateEditValue(date);
  }

  function closeDatePopover() {
    setDateAddOpen(false);
    setEditingDate(null);
    setDateError(null);
  }

  function addCustomDay() {
    if (addDayAt(customDate)) setDateAddOpen(false);
  }

  function updateDayDate() {
    if (!trip || !editingDate || !dateEditValue) {
      setDateError("날짜를 선택해주세요.");
      return;
    }
    if (dateEditValue !== editingDate && trip.days.some((d) => d.date === dateEditValue)) {
      setDateError("이미 일정에 추가된 날짜입니다.");
      return;
    }

    const days = sortDays(trip.days.map((d) => (d.date === editingDate ? { ...d, date: dateEditValue } : d)));
    const startDate = dateEditValue < trip.startDate ? dateEditValue : trip.startDate;
    const endDate = dateEditValue > trip.endDate ? dateEditValue : trip.endDate;
    saveNow({ ...trip, startDate, endDate, days });
    setDayIndex(days.findIndex((d) => d.date === dateEditValue));
    clearSelection();
    closeDatePopover();
  }

  function deleteDay(date: string) {
    if (!trip) return;
    const target = trip.days.find((d) => d.date === date);
    if (!target) return;
    if (!window.confirm(`${date} 일정과 그 안의 스팟을 삭제할까요?`)) return;

    const removedIndex = trip.days.findIndex((d) => d.date === date);
    const days = trip.days.filter((d) => d.date !== date);
    saveNow({ ...trip, days });
    setDayIndex(Math.max(0, Math.min(dayIndex > removedIndex ? dayIndex - 1 : dayIndex, days.length - 1)));
    clearSelection();
    setAddingSpot(false);
    setDayNoteOpen(false);
    closeDatePopover();
  }

  function startDayLongPress(date: string) {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      ignoreNextDayClick.current = true;
      openDateEditor(date);
    }, 600);
  }

  function cancelDayLongPress() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }

  function selectDay(index: number) {
    if (ignoreNextDayClick.current) {
      ignoreNextDayClick.current = false;
      return;
    }
    clearSelection();
    setDayIndex(index);
  }

  function updateDayNote(note: string) {
    if (!trip || !day) return;
    const days = trip.days.map((d, i) => (i !== dayIndex ? d : { ...d, note }));
    scheduleSave({ ...trip, days });
  }

  function addSpot(spotData: SpotFormValues) {
    if (!trip || !day) return;
    const spot: Spot = { ...spotData, id: crypto.randomUUID(), order: day.spots.length, bufferMinutes: 10, items: [] };
    const days = trip.days.map((d, i) => (i === dayIndex ? { ...d, spots: [...d.spots, spot] } : d));
    saveNow({ ...trip, days });
    setAddingSpot(false);
    setPendingCoordinate(null);
    setPendingPlace(null);
    setPointPickActive(false);
    setSelectedPlace(null);
    setPanelTab("itinerary");
    const nextSelection = { kind: "spot", spotId: spot.id } as const;
    previousItinerarySelectionRef.current = nextSelection;
    setSelection(nextSelection);
  }

  function startPointPick() {
    clearSelection();
    setAddingSpot(false);
    setPendingCoordinate(null);
    setPendingPlace(null);
    setPointPickActive(true);
  }

  function cancelPointPick() {
    setPointPickActive(false);
    setPendingCoordinate(null);
  }

  function pickMapPoint(point: MapPoint) {
    setPointPickActive(false);
    setPendingCoordinate(point);
    setPendingPlace(null);
    setSelectedPlace(null);
    setPanelTab("itinerary");
    setAddingSpot(true);
    panelActionsRef.current?.setPanelVisible(true);
  }

  function selectMapPlace(place: MapPlaceSelection) {
    if (selection) previousItinerarySelectionRef.current = selection;
    setSelection(null);
    setSharedLocationFocus(null);
    setPointPickActive(false);
    setPendingCoordinate(null);
    setSelectedPlace(place);
    setPanelTab("places");
    panelActionsRef.current?.setPanelVisible(true);
  }

  function addSelectedPlace(place: PlaceSelection) {
    previousItinerarySelectionRef.current = null;
    setPendingCoordinate(null);
    setPendingPlace(place);
    setSelectedPlace(null);
    setAddingSpot(true);
    setPanelTab("itinerary");
    panelActionsRef.current?.setPanelVisible(true);
  }

  function changePanelTab(next: PlannerPanelTab) {
    if (next === panelTab) return;
    if (next === "places") {
      if (selection) previousItinerarySelectionRef.current = selection;
      setSelection(null);
    } else {
      setSelection(previousItinerarySelectionRef.current);
    }
    setPanelTab(next);
  }

  function editSpot(spotId: string, updates: SpotFormValues) {
    if (!trip) return;
    const days = trip.days.map((d, i) =>
      i !== dayIndex ? d : { ...d, spots: d.spots.map((s) => (s.id !== spotId ? s : { ...s, ...updates })) },
    );
    saveNow({ ...trip, days });
  }

  function deleteSpot(spotId: string) {
    if (!trip) return;
    const days = trip.days.map((d, i) => (
      i !== dayIndex
        ? d
        : { ...d, spots: d.spots.filter((s) => s.id !== spotId), legPreferences: removeSpotLegPreferences(d.legPreferences, spotId) }
    ));
    const cover = trip.cover?.spotId === spotId
      ? (trip.cover.imageDataUrl ? { imageDataUrl: trip.cover.imageDataUrl } : null)
      : trip.cover;
    saveNow({ ...trip, days, cover });
  }

  function addItem(spotId: string, item: Omit<Item, "id" | "done">) {
    if (!trip) return;
    const days = trip.days.map((d, i) => {
      if (i !== dayIndex) return d;
      return {
        ...d,
        spots: d.spots.map((s) =>
          s.id !== spotId ? s : { ...s, items: [...s.items, { ...item, id: crypto.randomUUID(), done: false }] },
        ),
      };
    });
    saveNow({ ...trip, days });
  }

  function deleteItem(spotId: string, itemId: string) {
    if (!trip) return;
    const days = trip.days.map((d, i) => {
      if (i !== dayIndex) return d;
      return {
        ...d,
        spots: d.spots.map((s) => (s.id !== spotId ? s : { ...s, items: s.items.filter((it) => it.id !== itemId) })),
      };
    });
    saveNow({ ...trip, days });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !trip) return;
    const spots = trip.days[dayIndex].spots;
    const oldIndex = spots.findIndex((s) => s.id === active.id);
    const newIndex = spots.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(spots, oldIndex, newIndex).map((s, i) => ({ ...s, order: i }));
    const days = trip.days.map((d, i) => (i === dayIndex ? { ...d, spots: reordered } : d));
    scheduleSave({ ...trip, days });
  }

  function saveLegPreference(fromSpotId: string, toSpotId: string, mode: PersistedLegMode, routeIndex = 0, trafficAware = false) {
    if (!trip || !day) return;
    const previous = trip;
    const days = trip.days.map((candidate, index) => (
      index !== dayIndex
        ? candidate
        : { ...candidate, legPreferences: replaceLegPreference(candidate.legPreferences, fromSpotId, toSpotId, mode, { routeIndex, trafficAware }) }
    ));
    const next = { ...trip, days };
    qc.setQueryData(queryKey, next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setLegSaveError(null);
    setSelection({ kind: "leg", fromId: fromSpotId, toId: toSpotId });
    mutation.mutate(next, {
      onError: () => {
        qc.setQueryData(queryKey, previous);
        setLegSaveError("동선 선택을 저장하지 못했습니다. 이전 선택으로 되돌렸습니다.");
      },
    });
  }

  function setLegMode(fromSpotId: string, toSpotId: string, mode: PersistedLegMode) {
    saveLegPreference(fromSpotId, toSpotId, mode);
  }

  function toggleItem(spotId: string, itemId: string) {
    if (!trip) return;
    const days = trip.days.map((d, i) => {
      if (i !== dayIndex) return d;
      return {
        ...d,
        spots: d.spots.map((s) =>
          s.id !== spotId
            ? s
            : { ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)) },
        ),
      };
    });
    scheduleSave({ ...trip, days });
  }

  return (
    <MapsScope>
      <SplitMapShell
        map={
          <TripMap
            spots={day?.spots ?? []}
            date={day?.date ?? trip.startDate}
            timezone={trip.timezone}
            legPreferences={day?.legPreferences ?? []}
            selection={selection}
            onSelect={selectItinerary}
            sharedLocations={sharedLocations}
            focusedSharedUserId={focusedSharedUserId}
            onFocusSharedLocation={selectSharedLocation}
            locationSharing={locationSharing}
            onOpenLocationSharing={() => setSharePanelOpen(true)}
            pointPickActive={pointPickActive}
            onPickPoint={pickMapPoint}
            onCancelPointPick={cancelPointPick}
            selectedPlace={panelTab === "places" ? selectedPlace : null}
            onSelectPlace={selectMapPlace}
          />
        }
        headerLeft={
          <Button asChild variant="ghost" size="icon-lg" className="map-hero-back">
            <a href="/trips" aria-label="여행 목록으로" title="여행 목록으로" onClick={(e) => { e.preventDefault(); navigate("/trips"); }}>
              <ArrowLeft aria-hidden="true" />
            </a>
          </Button>
        }
        headerRight={(panelActions) => {
          panelActionsRef.current = panelActions;
          return <>
            <TripShareButton
              tripId={id}
              me={me}
              open={sharePanelOpen}
              onOpenChange={setSharePanelOpen}
              locationSharing={locationSharing}
              sharedLocations={sharedLocations}
              onFocusLocation={selectSharedLocation}
            />
            <TripActionsMenu trip={trip} onSave={saveNow} onExport={() => downloadTripExchange(trip)} saving={mutation.isPending} panelActions={panelActions} />
          </>;
        }}
        title={trip.title}
        subtitle={
          <>
            {formatScheduleDate(trip.startDate)} ~ {formatScheduleDate(trip.endDate)} · {trip.timezone} {mutation.isPending && "· 저장 중..."}
          </>
        }
        panel={
          <PlannerPanelTabs
            value={panelTab}
            onValueChange={changePanelTab}
            placeSelected={!!selectedPlace}
            itinerary={<>
            <div className="day-tabs-wrap">
              <div className="day-tabs">
                {trip.days.map((d, i) => (
                  <Button
                    key={d.date}
                    type="button"
                    variant={i === dayIndex ? "default" : "outline"}
                    className={i === dayIndex ? "active" : undefined}
                    onClick={() => selectDay(i)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openDateEditor(d.date);
                    }}
                    onPointerDown={(event) => {
                      if (event.pointerType !== "mouse" || event.button === 0) startDayLongPress(d.date);
                    }}
                    onPointerUp={cancelDayLongPress}
                    onPointerCancel={cancelDayLongPress}
                    onPointerLeave={cancelDayLongPress}
                    aria-label={`${d.date} 일정. 우클릭하거나 길게 눌러 날짜 관리`}
                  >
                    {formatScheduleDate(d.date)}
                  </Button>
                ))}
                <DateAddSplitButton onAddDay={addDay} onOpenDateAdd={openDateAdd} />
                {day && (
                  <Button type="button" variant="ghost" size="icon-lg" className="day-manage" aria-label={`${day.date} 날짜 관리`} onClick={() => openDateEditor(day.date)}>
                    ⋮
                  </Button>
                )}
              </div>

              {dateAddOpen && (
                <div className="day-date-popover" role="dialog" aria-label="특정 날짜 추가">
                  <label>
                    일정 날짜
                    <input type="date" value={customDate} onChange={(event) => setCustomDate(event.target.value)} />
                  </label>
                  {dateError && <p className="error day-date-error">{dateError}</p>}
                  <div className="day-date-actions">
                    <Button type="button" onClick={addCustomDay}>추가</Button>
                    <Button type="button" variant="ghost" onClick={closeDatePopover}>취소</Button>
                  </div>
                </div>
              )}

              {editingDate && (
                <div className="day-date-popover" role="dialog" aria-label={`${editingDate} 날짜 관리`}>
                  <label>
                    일정 날짜
                    <input type="date" value={dateEditValue} onChange={(event) => setDateEditValue(event.target.value)} />
                  </label>
                  <p className="meta day-date-hint">날짜를 바꾸면 해당 날짜의 메모와 스팟도 함께 이동합니다.</p>
                  {dateError && <p className="error day-date-error">{dateError}</p>}
                  <div className="day-date-actions">
                    <Button type="button" onClick={updateDayDate}>변경 저장</Button>
                    <Button type="button" variant="ghost" onClick={closeDatePopover}>취소</Button>
                    <Button type="button" variant="outline" className="day-delete" onClick={() => deleteDay(editingDate)}>날짜 삭제</Button>
                  </div>
                </div>
              )}
            </div>

            {day ? (
              <>
                {legSaveError && <p className="error leg-save-error" role="alert">{legSaveError}</p>}
                {day.note || dayNoteOpen ? (
                  <div className="day-note">
                    <p className="field-label">📝 이 날 메모</p>
                    <MarkdownEditor
                      value={day.note ?? ""}
                      onSave={updateDayNote}
                      rows={3}
                      placeholder="오늘 계획, 준비물, 예약 확인 같은 걸 적어두세요"
                    />
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="add-spot-button" onClick={() => setDayNoteOpen(true)}>
                    + 이 날 메모 추가
                  </Button>
                )}

                <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={day.spots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    <ul className="spot-list">
                      {[...day.spots]
                        .sort((a, b) => a.order - b.order)
                        .flatMap((spot, i, sorted) => {
                          const card = (
                            <SpotCard
                              key={spot.id}
                              spot={spot}
                              onToggleItem={(itemId) => toggleItem(spot.id, itemId)}
                              onDeleteItem={(itemId) => deleteItem(spot.id, itemId)}
                              onAddItem={(item) => addItem(spot.id, item)}
                              onDeleteSpot={() => deleteSpot(spot.id)}
                              onEditSpot={(updates) => editSpot(spot.id, updates)}
                              selected={
                                (selection?.kind === "spot" && selection.spotId === spot.id) ||
                                (selection?.kind === "leg" && (selection.fromId === spot.id || selection.toId === spot.id))
                              }
                              onSelect={() => selectItinerary({ kind: "spot", spotId: spot.id })}
                              date={day.date}
                              scheduleWarning={scheduleWarningBySpotId.get(spot.id)}
                            />
                          );
                          if (i === sorted.length - 1) return [card];
                          // Plain <li>, not a sortable item - dnd-kit's SortableContext
                          // only tracks elements that call useSortable (see SpotCard),
                          // so an inert row interleaved between them is safe.
                          return [
                            card,
                            <li key={`${spot.id}-leg`} className="leg-row">
                              {(() => {
                                const preference = legPreferenceFor(day.legPreferences, spot.id, sorted[i + 1].id);
                                return <LegInfo
                                  from={spot}
                                  to={sorted[i + 1]}
                                  date={day.date}
                                  timezone={trip.timezone}
                                  mode={preference.mode}
                                  routeIndex={preference.routeIndex}
                                  trafficAware={preference.trafficAware}
                                  selected={selection?.kind === "leg" && selection.fromId === spot.id && selection.toId === sorted[i + 1].id}
                                  onSelect={() => selectItinerary({ kind: "leg", fromId: spot.id, toId: sorted[i + 1].id })}
                                  onModeChange={(mode) => setLegMode(spot.id, sorted[i + 1].id, mode)}
                                  onRouteIndexChange={(routeIndex) => saveLegPreference(spot.id, sorted[i + 1].id, preference.mode, routeIndex, preference.trafficAware)}
                                  onTrafficAwareChange={(trafficAware) => saveLegPreference(spot.id, sorted[i + 1].id, preference.mode, preference.routeIndex, trafficAware)}
                                />;
                              })()}
                            </li>,
                          ];
                        })}
                      {addingSpot && (
                        <li>
                          <SpotForm
                            initialLocation={pendingCoordinate ?? undefined}
                            initialPlace={pendingPlace ?? undefined}
                            onSubmit={addSpot}
                            onCancel={() => { setAddingSpot(false); setPendingCoordinate(null); setPendingPlace(null); }}
                          />
                        </li>
                      )}
                    </ul>
                  </SortableContext>
                </DndContext>
                {!addingSpot && (
                  <div className="add-spot-actions">
                    <Button type="button" variant="outline" className="add-spot-button" onClick={() => { setPendingCoordinate(null); setPendingPlace(null); setAddingSpot(true); }}>
                      + 스팟 추가
                    </Button>
                    <Button type="button" variant="outline" className="add-spot-button" aria-pressed={pointPickActive} onClick={pointPickActive ? cancelPointPick : startPointPick}>
                      <MapPinPlus aria-hidden="true" /> {pointPickActive ? "지도 선택 취소" : "지도에서 선택"}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="empty">
                일자가 없습니다. 위 <strong>+ 날짜</strong> 버튼으로 추가하세요.
              </p>
            )}
            </>}
            places={
              <PlaceDetailsPanel
                selection={selectedPlace}
                onAdd={addSelectedPlace}
                onClose={() => { setSelectedPlace(null); setPanelTab("itinerary"); }}
                canAdd={!!day}
              />
            }
          />
        }
      />
    </MapsScope>
  );
}
