import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { saveTrip } from "../api";
import { MapsScope } from "../components/MapsScope";
import { PlaceAutocompleteInput, type PlaceSelection } from "../components/PlaceAutocompleteInput";

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
  const [timezone, setTimezone] = useState("Asia/Tokyo");
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
        timezone,
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
      <p className="meta">대표 장소를 선택하면 여행 첫날 일정에 바로 추가합니다. 나머지 날짜와 스팟은 다음 화면에서 추가하세요.</p>
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
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {timezoneOptions().map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
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
