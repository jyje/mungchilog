import { useEffect, useState } from "react";
import type { Trip, Spot } from "../types";
import { MAX_COVER_IMAGE_BYTES } from "../types";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function allSpots(trip: Trip): Array<{ date: string; spot: Spot }> {
  return trip.days.flatMap((day) => day.spots.map((spot) => ({ date: day.date, spot }))).sort((a, b) => a.date.localeCompare(b.date) || a.spot.order - b.spot.order);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지 파일을 읽지 못했습니다."));
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("이미지 파일을 읽지 못했습니다.")));
    reader.readAsDataURL(file);
  });
}

export function TripCoverEditor({
  trip,
  onSave,
  onSaved,
  onDirtyChange,
  saving,
}: {
  trip: Trip;
  onSave: (trip: Trip) => void;
  onSaved: () => void;
  onDirtyChange: (spotId: string, imageDataUrl: string) => void;
  saving: boolean;
}) {
  const [spotId, setSpotId] = useState(trip.cover?.spotId ?? "");
  const [imageDataUrl, setImageDataUrl] = useState(trip.cover?.imageDataUrl ?? "");
  const [imageError, setImageError] = useState<string | null>(null);
  const spots = allSpots(trip);

  useEffect(() => {
    onDirtyChange(spotId, imageDataUrl);
  }, [imageDataUrl, onDirtyChange, spotId]);

  async function chooseImage(file: File | undefined) {
    if (!file) return;
    setImageError(null);
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setImageError("JPEG, PNG 또는 WebP 이미지만 사용할 수 있습니다.");
      return;
    }
    if (file.size > MAX_COVER_IMAGE_BYTES) {
      setImageError("이미지 크기는 2 MiB 이하여야 합니다.");
      return;
    }

    try {
      setImageDataUrl(await readFileAsDataUrl(file));
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "이미지 파일을 읽지 못했습니다.");
    }
  }

  function saveCover() {
    const cover = spotId || imageDataUrl ? { ...(spotId ? { spotId } : {}), ...(imageDataUrl ? { imageDataUrl } : {}) } : null;
    onSave({ ...trip, cover });
    onSaved();
  }

  return (
    <div className="trip-cover-editor">
      <label className="trip-cover-field">
        대표 장소
        <select value={spotId} onChange={(event) => setSpotId(event.target.value)}>
          <option value="">선택하지 않음</option>
          {spots.map(({ date, spot }) => (
            <option key={spot.id} value={spot.id}>
              {date} - {spot.name}
            </option>
          ))}
        </select>
      </label>

      <label className="trip-cover-field">
        대표 이미지
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseImage(event.target.files?.[0])} />
      </label>
      <p className="trip-cover-file-hint">JPEG, PNG 또는 WebP 파일을 선택할 수 있습니다. 최대 2 MiB.</p>
      {imageError && <p className="error">{imageError}</p>}

      {imageDataUrl && (
        <div className="trip-cover-preview">
          <img src={imageDataUrl} alt="선택한 대표 이미지 미리보기" />
          <button type="button" className="ghost" onClick={() => setImageDataUrl("")}>이미지 제거</button>
        </div>
      )}

      <div className="trip-cover-actions">
        <button type="button" onClick={saveCover} disabled={saving}>
          {saving ? "저장 중..." : "대표 화면 저장"}
        </button>
        {(spotId || imageDataUrl) && (
          <button
            type="button"
            className="ghost"
            disabled={saving}
            onClick={() => {
              setSpotId("");
              setImageDataUrl("");
              onSave({ ...trip, cover: null });
              onSaved();
            }}
          >
            대표 화면 비우기
          </button>
        )}
      </div>
    </div>
  );
}
