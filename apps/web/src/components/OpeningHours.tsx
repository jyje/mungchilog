import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

type OpeningHoursData = {
  regularOpeningHours: { weekdayDescriptions?: string[] } | null;
  fetchedAt: string;
} | null;

async function fetchHours(placeId: string): Promise<OpeningHoursData> {
  const res = await fetch(`/api/places/${encodeURIComponent(placeId)}/hours`);
  if (res.status === 501) {
    const body = await res.json().catch(() => ({}));
    return body.cached ?? null;
  }
  if (!res.ok) return null;
  return res.json();
}

function mondayFirstIndex(date?: string) {
  // A previously cached itinerary or a partially loaded card must not take
  // down the whole day view. SpotCard always supplies a date, but defaulting
  // to Monday here keeps the displayed weekly data deterministic while it is
  // unavailable.
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;

  const [year, month, day] = date.split("-").map(Number);
  const sundayFirst = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return sundayFirst === 0 ? 6 : sundayFirst - 1;
}

// Opening hours must match the itinerary's calendar day, not the viewer's
// current date. The weekly table remains available by hover, touch, and
// keyboard for planning around adjacent days.
export function OpeningHours({ placeId, date }: { placeId?: string; date?: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data } = useQuery({
    queryKey: ["places", placeId, "hours"],
    queryFn: () => fetchHours(placeId!),
    enabled: !!placeId,
    staleTime: 1000 * 60 * 60 * 24 * 30,
  });

  if (!placeId) return null;
  const descriptions = data?.regularOpeningHours?.weekdayDescriptions;
  if (!descriptions || descriptions.length !== 7) return null;

  const scheduledHours = descriptions[mondayFirstIndex(date)];

  return (
    <div className="opening-hours" onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}>
      <button
        type="button"
        className="opening-hours-summary meta"
        aria-expanded={expanded}
        aria-label={`${scheduledHours}. 전체 영업시간 보기`}
        onClick={() => setExpanded((open) => !open)}
        onFocus={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
      >
        🕐 {scheduledHours}
      </button>
      {expanded && (
        <div className="opening-hours-popover" role="tooltip">
          <strong>전체 영업시간</strong>
          <ul>
            {descriptions.map((description) => (
              <li key={description} className={description === scheduledHours ? "active" : ""}>
                {description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
