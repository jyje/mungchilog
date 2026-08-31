import { useState } from "react";
import type { Spot } from "../types";
import { PlaceAutocompleteInput, type PlaceSelection } from "./PlaceAutocompleteInput";
import { MarkdownEditor } from "./MarkdownEditor";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

export type SpotFormValues = {
  name: string;
  nameLocal?: string;
  plannedArrival?: string;
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
  submitLabel = "스팟 추가",
  onSubmit,
  onCancel,
}: {
  initial?: Pick<Spot, "name" | "nameLocal" | "plannedArrival" | "note" | "placeId" | "lat" | "lng" | "category">;
  initialLocation?: CoordinateSelection;
  submitLabel?: string;
  onSubmit: (spot: SpotFormValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [nameLocal, setNameLocal] = useState(initial?.nameLocal ?? "");
  const [plannedArrival, setPlannedArrival] = useState(initial?.plannedArrival ?? "");
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
    const matchedPlace = picked?.kind === "place" && picked.name === name;
    const coordinates = picked?.kind === "coordinate" || matchedPlace ? picked : null;
    const hasCoordinates = coordinates != null && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng);
    onSubmit({
      name: name.trim(),
      nameLocal: nameLocal.trim() || undefined,
      plannedArrival: plannedArrival || undefined,
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
      <input
        type="time"
        className="spot-time-input"
        value={plannedArrival}
        onChange={(e) => setPlannedArrival(e.target.value)}
      />
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
