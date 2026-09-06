import { useState } from "react";
import type { Spot, SpotTimeKind } from "../types";
import { PlaceAutocompleteInput, type PlaceSelection } from "./PlaceAutocompleteInput";
import { MarkdownEditor } from "./MarkdownEditor";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Switch } from "./ui/switch";
import { resolveTripWallClock, spotScheduleDisplay, wallClockMinutes } from "../schedule";

// `category` is Places' own localized display name (e.g. "호텔", "Hotel"),
// not a stable machine type, so this is a keyword sniff across the
// languages this app actually sees - good enough to pre-check the toggle
// below on first pick, never to force it. A picked place with no category,
// or wording outside this list (an Airbnb, most ryokan listings), still
// leaves the toggle in the user's hands.
const ACCOMMODATION_KEYWORDS = [
  "lodging", "hotel", "hostel", "motel", "inn", "resort", "guest house", "guesthouse",
  "호텔", "게스트하우스", "모텔", "여관", "펜션", "리조트",
  "ホテル", "旅館", "民宿", "ゲストハウス",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matched with a boundary on each side (start/end of string, or a
// non-alphanumeric character) so a short keyword like "inn" or "resort"
// can't fire inside an unrelated word ("Innovation Museum", "Insurance
// Agency") - a bare substring search did exactly that.
function looksLikeAccommodation(category?: string): boolean {
  if (!category) return false;
  const normalized = category.toLowerCase();
  return ACCOMMODATION_KEYWORDS.some((keyword) => {
    const escaped = escapeRegExp(keyword.toLowerCase());
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(normalized);
  });
}

export type SpotFormValues = {
  name: string;
  nameLocal?: string;
  plannedArrival?: string;
  plannedDeparture?: string;
  timeKind?: SpotTimeKind;
  note?: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  category?: string;
  isAccommodation: boolean;
};

export type CoordinateSelection = { lat: number; lng: number };

type SelectedLocation =
  | { kind: "place"; name: string; placeId: string; lat?: number; lng?: number; category?: string }
  | ({ kind: "coordinate" } & CoordinateSelection);

// Shared by both "+ 스팟 추가" (no initial values) and SpotCard's inline
// edit mode (initial = the existing spot). All four location fields are
// always present in the submitted object, even as undefined, so an edit
// that types over a picked place without reselecting correctly clears the
// stale placeId/lat/lng instead of leaving them stuck to the new name.
export function SpotForm({
  initial,
  initialLocation,
  initialPlace,
  date,
  timezone,
  submitLabel = "스팟 추가",
  onSubmit,
  onCancel,
}: {
  initial?: Pick<Spot, "name" | "nameLocal" | "plannedArrival" | "plannedDeparture" | "timeKind" | "dwellMinutes" | "note" | "placeId" | "lat" | "lng" | "category" | "isAccommodation">;
  initialLocation?: CoordinateSelection;
  initialPlace?: PlaceSelection;
  date?: string;
  timezone?: string;
  submitLabel?: string;
  onSubmit: (spot: SpotFormValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? initialPlace?.name ?? "");
  const [nameLocal, setNameLocal] = useState(initial?.nameLocal ?? "");
  const [plannedArrival, setPlannedArrival] = useState(initial?.plannedArrival ?? "");
  const [timeKind, setTimeKind] = useState<SpotTimeKind>(initial?.timeKind ?? "APPROXIMATE");
  // Falls back to the legacy dwellMinutes-derived end only for a spot a
  // migration hasn't rewritten yet - see schedule.ts's spotScheduleDisplay.
  const [plannedDeparture, setPlannedDeparture] = useState(
    () => initial?.plannedDeparture ?? spotScheduleDisplay(initial ?? {})?.end ?? "",
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [isAccommodation, setIsAccommodation] = useState(
    initial?.isAccommodation ?? looksLikeAccommodation(initial?.category ?? initialPlace?.category),
  );
  // Once the person has touched the toggle themselves, a later place pick
  // stops overwriting their choice - the keyword guess only gets to speak
  // once, before they've said anything of their own. Editing an existing
  // spot counts as already decided even before any click: `initial` always
  // carries a real isAccommodation value (true or an explicit false), and
  // re-picking the same place to refresh its coordinates must not silently
  // flip that decision back to a fresh guess.
  const [accommodationTouched, setAccommodationTouched] = useState(!!initial);
  const [picked, setPicked] = useState<SelectedLocation | null>(
    initial?.placeId
      ? {
          kind: "place",
          name: initial.name,
          placeId: initial.placeId,
          lat: initial.lat,
          lng: initial.lng,
          category: initial.category,
        }
      : initialPlace
        ? { kind: "place", ...initialPlace }
        : initial?.lat != null && initial?.lng != null
        ? { kind: "coordinate", lat: initial.lat, lng: initial.lng }
        : initialLocation
          ? { kind: "coordinate", ...initialLocation }
          : null,
  );

  function handleNameChange(text: string) {
    setName(text);
    // Typing over a previously picked suggestion invalidates its
    // placeId/coords - only a fresh pick (or the untouched initial value)
    // keeps them attached.
    if (picked?.kind === "place" && text !== picked.name) setPicked(null);
  }

  function handleSelect(place: PlaceSelection) {
    setPicked({ kind: "place", ...place });
    setName(place.name);
    if (!accommodationTouched) setIsAccommodation(looksLikeAccommodation(place.category));
  }

  // Advisory only, never a submit gate: reordering an itinerary before its
  // times are filled in is a normal workflow, and a spot mid-reorder can
  // legitimately have no start, no end, or a time that conflicts with its
  // neighbor. Blocking save on any of that would fight the workflow instead
  // of supporting it - the day view's non-blocking scheduleWarnings (see
  // SpotCard's scheduleWarning prop) already surfaces a real conflict with
  // the *previous* stop; this only covers a DST-nonexistent time, which
  // needs the still-being-edited value in this form to catch before save.
  const dstWarning = (() => {
    if (!date || !timezone) return null;
    if (plannedArrival && !resolveTripWallClock(date, plannedArrival, timezone).exact) {
      return "시작 시각이 여행지 표준시의 일광 절약 시간 전환으로 존재하지 않습니다. 그래도 저장은 되지만, 다른 시각으로 바꾸는 걸 권장해요.";
    }
    if (plannedDeparture) {
      const startMinutes = wallClockMinutes(plannedArrival);
      const endMinutes = wallClockMinutes(plannedDeparture);
      const crossesMidnight = startMinutes != null && endMinutes != null && endMinutes < startMinutes;
      if (!resolveTripWallClock(date, plannedDeparture, timezone, crossesMidnight ? 24 * 60 : 0).exact) {
        return "종료 시각이 여행지 표준시의 일광 절약 시간 전환으로 존재하지 않습니다. 그래도 저장은 되지만, 다른 시각으로 바꾸는 걸 권장해요.";
      }
    }
    return null;
  })();

  function submit() {
    if (!name.trim()) return;
    const matchedPlace = picked?.kind === "place" && picked.name === name;
    const coordinates = picked?.kind === "coordinate" || matchedPlace ? picked : null;
    const hasCoordinates = coordinates != null && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng);
    const arrival = plannedArrival || undefined;
    const departure = plannedDeparture || undefined;
    onSubmit({
      name: name.trim(),
      nameLocal: nameLocal.trim() || undefined,
      plannedArrival: arrival,
      plannedDeparture: departure,
      // A time kind describes confidence in a time that exists; with
      // neither set it has nothing to describe.
      timeKind: arrival || departure ? timeKind : undefined,
      note: note.trim() || undefined,
      placeId: matchedPlace ? picked.placeId : undefined,
      lat: hasCoordinates ? coordinates.lat : undefined,
      lng: hasCoordinates ? coordinates.lng : undefined,
      category: matchedPlace ? picked.category : undefined,
      isAccommodation,
    });
  }

  // A <div>, not <li>: SpotCard nests this inside an existing <li> (edit
  // mode), and <li> can't validly contain another <li>. Callers that use
  // this for the "+ 스팟 추가" row (a genuine new list item) wrap it in
  // their own <li>.
  return (
    <div className="add-spot-form">
      <PlaceAutocompleteInput
        value={name}
        onChange={handleNameChange}
        onSelect={handleSelect}
        placeholder="장소 이름 (검색 시 지도 위치가 자동으로 붙습니다)"
      />
      {picked?.kind === "coordinate" && (
        <div className="spot-coordinate-selection" role="status">
          <Badge variant="secondary">지도 좌표</Badge>
          <span>{picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}</span>
        </div>
      )}
      <Input className="min-h-11" type="text" placeholder="현지어 이름 (선택)" value={nameLocal} onChange={(e) => setNameLocal(e.target.value)} />
      <label className="spot-accommodation-toggle">
        <span className="spot-accommodation-copy">
          <span className="tt">🏨 이 장소는 숙소예요</span>
          <span className="td">타임라인·지도에서 숙소로 표시되고, 하루의 첫/마지막 순서일 때 자동으로 출발·도착 지점이 돼요</span>
        </span>
        <Switch
          checked={isAccommodation}
          onCheckedChange={(checked) => {
            setIsAccommodation(checked === true);
            setAccommodationTouched(true);
          }}
          aria-label="이 장소를 숙소로 표시"
        />
      </label>
      <fieldset className="spot-schedule-editor">
        <legend>일정 시각</legend>
        <RadioGroup
          className="spot-time-kind"
          value={timeKind}
          onValueChange={(value) => setTimeKind(value as SpotTimeKind)}
          aria-label="일정 시각 유형"
        >
          <label><RadioGroupItem value="APPROXIMATE" /> 대략적인 시각</label>
          <label><RadioGroupItem value="RESERVATION" /> 예약 시각</label>
        </RadioGroup>
        <div className="spot-schedule-fields">
          <label>
            <span>시작 시각 (선택)</span>
            <Input
              type="time"
              className="spot-time-input"
              value={plannedArrival}
              onChange={(event) => setPlannedArrival(event.target.value)}
              aria-label="시작 시각 입력"
              aria-invalid={!!dstWarning}
              aria-describedby={dstWarning ? "spot-schedule-warning" : undefined}
            />
          </label>
          <label>
            <span>종료 시각 (선택)</span>
            <Input
              type="time"
              className="spot-time-input"
              value={plannedDeparture}
              onChange={(event) => setPlannedDeparture(event.target.value)}
              aria-label="종료 시각 입력"
              aria-invalid={!!dstWarning}
              aria-describedby={dstWarning ? "spot-schedule-warning" : undefined}
            />
          </label>
        </div>
        {dstWarning && <p id="spot-schedule-warning" className="spot-schedule-error" role="status">{dstWarning}</p>}
      </fieldset>
      <MarkdownEditor value={note} onChange={setNote} rows={3} placeholder="메모 (선택) - 마크다운으로 적을 수 있어요" />
      <div className="add-spot-row">
        <Button type="button" onClick={submit} disabled={!name.trim()}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
