import { useState } from "react";
import type { Spot, SpotTimeKind } from "../types";
import { PlaceAutocompleteInput, type PlaceSelection } from "./PlaceAutocompleteInput";
import { MarkdownEditor } from "./MarkdownEditor";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { resolveTripWallClock } from "../schedule";

export type SpotFormValues = {
  name: string;
  nameLocal?: string;
  plannedArrival?: string;
  timeKind?: SpotTimeKind;
  dwellMinutes?: number;
  note?: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  category?: string;
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
  initial?: Pick<Spot, "name" | "nameLocal" | "plannedArrival" | "timeKind" | "dwellMinutes" | "note" | "placeId" | "lat" | "lng" | "category">;
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
  const [timeChoice, setTimeChoice] = useState<"NONE" | SpotTimeKind>(
    initial?.plannedArrival ? initial.timeKind ?? "APPROXIMATE" : "NONE",
  );
  const [dwellMinutes, setDwellMinutes] = useState(initial?.dwellMinutes?.toString() ?? "");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [note, setNote] = useState(initial?.note ?? "");
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
  }

  function submit() {
    if (!name.trim()) return;
    if (timeChoice !== "NONE" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(plannedArrival)) {
      setScheduleError("일정 시각을 24시간제로 입력해주세요.");
      return;
    }
    if (timeChoice !== "NONE" && date && timezone && !resolveTripWallClock(date, plannedArrival, timezone).exact) {
      setScheduleError("이 시각은 여행지 표준시의 일광 절약 시간 전환으로 존재하지 않습니다. 다른 시각을 선택해주세요.");
      return;
    }
    const parsedDwell = dwellMinutes === "" ? undefined : Number(dwellMinutes);
    if (timeChoice !== "NONE" && (parsedDwell != null && (!Number.isInteger(parsedDwell) || parsedDwell < 0))) {
      setScheduleError("머무는 시간은 0 이상의 분 단위 정수여야 합니다.");
      return;
    }
    setScheduleError(null);
    const matchedPlace = picked?.kind === "place" && picked.name === name;
    const coordinates = picked?.kind === "coordinate" || matchedPlace ? picked : null;
    const hasCoordinates = coordinates != null && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng);
    onSubmit({
      name: name.trim(),
      nameLocal: nameLocal.trim() || undefined,
      plannedArrival: timeChoice === "NONE" ? undefined : plannedArrival,
      timeKind: timeChoice === "NONE" ? undefined : timeChoice,
      dwellMinutes: timeChoice === "NONE" ? undefined : parsedDwell,
      note: note.trim() || undefined,
      placeId: matchedPlace ? picked.placeId : undefined,
      lat: hasCoordinates ? coordinates.lat : undefined,
      lng: hasCoordinates ? coordinates.lng : undefined,
      category: matchedPlace ? picked.category : undefined,
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
      <input type="text" placeholder="현지어 이름 (선택)" value={nameLocal} onChange={(e) => setNameLocal(e.target.value)} />
      <fieldset className="spot-schedule-editor">
        <legend>일정 시각</legend>
        <RadioGroup
          className="spot-time-kind"
          value={timeChoice}
          onValueChange={(value) => {
            setTimeChoice(value as "NONE" | SpotTimeKind);
            setScheduleError(null);
          }}
          aria-label="일정 시각 유형"
        >
          <label><RadioGroupItem value="NONE" /> 시간 미정</label>
          <label><RadioGroupItem value="APPROXIMATE" /> 대략적인 시각</label>
          <label><RadioGroupItem value="RESERVATION" /> 예약 시각</label>
        </RadioGroup>
        {timeChoice !== "NONE" && (
          <div className="spot-schedule-fields">
            <label>
              <span>{timeChoice === "RESERVATION" ? "예약 시각" : "예상 시각"}</span>
              <Input
                type="time"
                className="spot-time-input"
                value={plannedArrival}
                onChange={(event) => { setPlannedArrival(event.target.value); setScheduleError(null); }}
                aria-label={timeChoice === "RESERVATION" ? "예약 시각 입력" : "예상 시각 입력"}
                aria-invalid={!!scheduleError}
                aria-describedby={scheduleError ? "spot-schedule-error" : undefined}
              />
            </label>
            <label>
              <span>머무는 시간 (분, 선택)</span>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                step="15"
                value={dwellMinutes}
                onChange={(event) => { setDwellMinutes(event.target.value); setScheduleError(null); }}
                aria-invalid={!!scheduleError}
              />
            </label>
          </div>
        )}
        {scheduleError && <p id="spot-schedule-error" className="spot-schedule-error" role="alert">{scheduleError}</p>}
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
