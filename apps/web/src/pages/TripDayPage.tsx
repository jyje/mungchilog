import { useEffect, useRef, useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { getTrip, saveTrip } from "../api";
import type { Trip } from "../types";
import { TripMap } from "../components/TripMap";
import { SpotCard } from "../components/SpotCard";

export function TripDayPage({ id, navigate }: { id: string; navigate: (path: string) => void }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getTrip(id)
      .then(setTrip)
      .catch((e) => setError(String(e.message ?? e)));
  }, [id]);

  // Debounced persist: avoid firing a save on every intermediate drag frame.
  function scheduleSave(next: Trip) {
    setTrip(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      const { id: tripId, ...data } = next;
      saveTrip({ id: tripId, ...data })
        .catch((e) => setError(String(e.message ?? e)))
        .finally(() => setSaving(false));
    }, 800);
  }

  if (error) return <p className="error">{error}</p>;
  if (!trip) return <p className="meta">불러오는 중...</p>;

  const day = trip.days[dayIndex];

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
        {trip.startDate} ~ {trip.endDate} · {trip.timezone} {saving && "· 저장 중..."}
      </p>

      <div className="day-tabs">
        {trip.days.map((d, i) => (
          <button key={d.date} className={i === dayIndex ? "active" : ""} onClick={() => setDayIndex(i)}>
            {d.date}
          </button>
        ))}
      </div>

      {day ? (
        <>
          <TripMap spots={day.spots} />
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={day.spots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ul className="spot-list">
                {[...day.spots]
                  .sort((a, b) => a.order - b.order)
                  .map((spot) => (
                    <SpotCard key={spot.id} spot={spot} onToggleItem={(itemId) => toggleItem(spot.id, itemId)} />
                  ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      ) : (
        <p className="empty">일자 없음</p>
      )}
    </div>
  );
}
