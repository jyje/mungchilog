import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { lookupTimezone, saveTrip } from "../api";
import { MapsScope } from "../components/MapsScope";
import { PlaceAutocompleteInput, type PlaceSelection } from "../components/PlaceAutocompleteInput";
import { DEFAULT_TIMEZONE } from "../types";

// Full IANA list where the browser supports it (Chrome/Safari 15.4+);
// a short curated fallback everywhere else. Not locked to any one
// destination - see PLAN.md.
const COMMON_TIMEZONES = [
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Taipei",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Manila",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

function timezoneOptions(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      // fall through
    }
  }
  return COMMON_TIMEZONES;
}

// The other way to get a trip in: a plain form instead of pasting JSON.
// Creates an empty trip (no days yet) and hands off to the day view,
// where "+ 날짜 추가" / "+ 스팟 추가" build it out from there.
export function NewTripPage({ navigate }: { navigate: (path: string) => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [timezoneManuallySelected, setTimezoneManuallySelected] = useState(false);
  const [timezoneMessage, setTimezoneMessage] = useState<string | null>(null);
  const timezoneLookupVersion = useRef(0);
  const [currency, setCurrency] = useState("JPY");
  const [representativePlaceName, setRepresentativePlaceName] = useState("");
  const [representativePlace, setRepresentativePlace] = useState<PlaceSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !startDate || !endDate) {
      setError("제목과 시작일·종료일을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const hasRepresentativePlace = representativePlaceName.trim().length > 0;
      const representativeSpot = hasRepresentativePlace
        ? {
            id: crypto.randomUUID(),
            order: 0,
            name: representativePlaceName.trim(),
            ...(representativePlace?.name === representativePlaceName ? {
              placeId: representativePlace.placeId,
              lat: representativePlace.lat,
              lng: representativePlace.lng,
              category: representativePlace.category,
            } : {}),
            bufferMinutes: 10,
            items: [],
          }
        : null;
      const { id } = await saveTrip({
        title: title.trim(),
        timezone: timezone.trim() || DEFAULT_TIMEZONE,
        currency: currency.trim() || "JPY",
        startDate,
        endDate,
        days: representativeSpot ? [{ date: startDate, spots: [representativeSpot], legPreferences: [] }] : [],
        ...(representativeSpot ? { cover: { spotId: representativeSpot.id } } : {}),
      });
      await qc.invalidateQueries({ queryKey: ["trips"] });
      navigate(`/trips/${id}`);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MapsScope>
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
      <h1>새 여행 만들기</h1>
      <p className="meta">대표 장소를 선택하면 여행 첫날 일정에 바로 추가합니다. 장소의 시간대를 찾지 못했거나 비워두면 서울 시간(Asia/Seoul)을 사용합니다.</p>
      <form onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">제목</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="도쿄·오사카 5박6일" />
        </label>
        <label className="field">
          <span className="field-label">시작일</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">종료일</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">목적지 시간대</span>
          <select value={timezone} onChange={(e) => { timezoneLookupVersion.current += 1; setTimezone(e.target.value); setTimezoneManuallySelected(true); setTimezoneMessage(null); }}>
            {timezoneOptions().map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        {timezoneMessage && <p className="meta" role="status">{timezoneMessage}</p>}
        <label className="field">
          <span className="field-label">통화</span>
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            placeholder="JPY"
            maxLength={3}
          />
        </label>
        <label className="field">
          <span className="field-label">대표 장소 (선택)</span>
          <PlaceAutocompleteInput
            value={representativePlaceName}
            autoFocus={false}
            placeholder="여행을 대표할 장소를 검색하세요"
            onChange={(value) => {
              setRepresentativePlaceName(value);
              if (representativePlace && value !== representativePlace.name) setRepresentativePlace(null);
            }}
            onSelect={(place) => {
              setRepresentativePlace(place);
              setRepresentativePlaceName(place.name);
              if (timezoneManuallySelected || !Number.isFinite(place.lat) || !Number.isFinite(place.lng) || (place.lat === 0 && place.lng === 0)) return;
              const lookupVersion = timezoneLookupVersion.current + 1;
              timezoneLookupVersion.current = lookupVersion;
              setTimezoneMessage("대표 장소의 시간대를 확인하는 중...");
              lookupTimezone(place.lat, place.lng, startDate)
                .then(({ timezone: resolvedTimezone }) => {
                  if (timezoneLookupVersion.current !== lookupVersion) return;
                  if (resolvedTimezone) {
                    setTimezone(resolvedTimezone);
                    setTimezoneMessage(`${resolvedTimezone} 시간대로 설정했습니다.`);
                  } else {
                    setTimezone(DEFAULT_TIMEZONE);
                    setTimezoneMessage("시간대를 찾지 못해 서울 시간(Asia/Seoul)을 사용합니다.");
                  }
                })
                .catch(() => {
                  if (timezoneLookupVersion.current !== lookupVersion) return;
                  setTimezone(DEFAULT_TIMEZONE);
                  setTimezoneMessage("시간대를 찾지 못해 서울 시간(Asia/Seoul)을 사용합니다.");
                });
            }}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "만드는 중..." : "만들기"}
        </button>
      </form>
      </div>
    </MapsScope>
  );
}
