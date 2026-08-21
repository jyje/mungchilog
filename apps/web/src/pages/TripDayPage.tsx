import { useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { getTrip, saveTrip } from "../api";
import type { Item, Spot, Trip } from "../types";
import { TripMap } from "../components/TripMap";
import { SpotCard } from "../components/SpotCard";
import { LegInfo } from "../components/LegInfo";
import { AddSpotForm } from "../components/AddSpotForm";

function nextDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function TripDayPage({ id, navigate }: { id: string; navigate: (path: string) => void }) {
  const qc = useQueryClient();
  const queryKey = ["trip", id];
  const { data: trip, error } = useQuery({ queryKey, queryFn: () => getTrip(id) });
  const [dayIndex, setDayIndex] = useState(0);
  const [addingSpot, setAddingSpot] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function addDay() {
    if (!trip) return;
    const date = trip.days.length > 0 ? nextDate(trip.days[trip.days.length - 1].date) : trip.startDate;
    saveNow({ ...trip, days: [...trip.days, { date, spots: [] }] });
    setDayIndex(trip.days.length);
  }

  function addSpot(spotData: Omit<Spot, "id" | "order" | "items" | "bufferMinutes">) {
    if (!trip || !day) return;
    const spot: Spot = { ...spotData, id: crypto.randomUUID(), order: day.spots.length, bufferMinutes: 10, items: [] };
    const days = trip.days.map((d, i) => (i === dayIndex ? { ...d, spots: [...d.spots, spot] } : d));
    saveNow({ ...trip, days });
    setAddingSpot(false);
  }

  function deleteSpot(spotId: string) {
    if (!trip) return;
    const days = trip.days.map((d, i) => (i !== dayIndex ? d : { ...d, spots: d.spots.filter((s) => s.id !== spotId) }));
    saveNow({ ...trip, days });
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
    <div className="page">
      <p>
        <a
          href="/trips"
          onClick={(e) => {
            e.preventDefault();
            navigate("/trips");
          }}
        >
          ← 목록
        </a>
      </p>
      <h1>{trip.title}</h1>
      <p className="meta">
        {trip.startDate} ~ {trip.endDate} · {trip.timezone} {mutation.isPending && "· 저장 중..."}
      </p>

      <div className="day-tabs">
        {trip.days.map((d, i) => (
          <button key={d.date} className={i === dayIndex ? "active" : ""} onClick={() => setDayIndex(i)}>
            {d.date}
          </button>
        ))}
        <button type="button" className="day-add" onClick={addDay}>
          + 날짜
        </button>
      </div>

      {day ? (
        <>
          <TripMap spots={day.spots} />
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
                      />
                    );
                    if (i === sorted.length - 1) return [card];
                    // Plain <li>, not a sortable item - dnd-kit's SortableContext
                    // only tracks elements that call useSortable (see SpotCard),
                    // so an inert row interleaved between them is safe.
                    return [
                      card,
                      <li key={`${spot.id}-leg`} className="leg-row">
                        <LegInfo from={spot} to={sorted[i + 1]} date={day.date} />
                      </li>,
                    ];
                  })}
                {addingSpot && <AddSpotForm onAdd={addSpot} onCancel={() => setAddingSpot(false)} />}
              </ul>
            </SortableContext>
          </DndContext>
          {!addingSpot && (
            <button type="button" className="add-spot-button" onClick={() => setAddingSpot(true)}>
              + 스팟 추가
            </button>
          )}
        </>
      ) : (
        <p className="empty">
          일자가 없습니다. 위 <strong>+ 날짜</strong> 버튼으로 추가하세요.
        </p>
      )}
    </div>
  );
}
