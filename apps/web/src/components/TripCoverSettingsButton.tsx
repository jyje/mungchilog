import { useEffect, useRef, useState } from "react";
import type { Trip } from "../types";
import { TripCoverEditor } from "./TripCoverEditor";

function hasUnsavedChanges(trip: Trip, spotId: string, imageDataUrl: string) {
  return (trip.cover?.spotId ?? "") !== spotId || (trip.cover?.imageDataUrl ?? "") !== imageDataUrl;
}

export function TripCoverSettingsButton({ trip, onSave, saving }: { trip: Trip; onSave: (trip: Trip) => void; saving: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!editorOpen) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [editorOpen]);

  function requestClose() {
    if (saving) return;
    if (unsaved && !window.confirm("저장하지 않은 대표 화면 설정을 버릴까요?")) return;
    setEditorOpen(false);
  }

  return (
    <>
      <div className="menu-anchor">
        <button
          type="button"
          className="menu-button"
          aria-label="여행 더보기"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          ⋮
        </button>
        {menuOpen && (
          <>
            <button type="button" className="menu-backdrop" aria-label="더보기 닫기" onClick={() => setMenuOpen(false)} />
            <div className="layout-menu trip-actions-menu" role="menu" aria-label="여행 더보기">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setEditorOpen(true);
                }}
              >
                대표 화면 설정
              </button>
            </div>
          </>
        )}
      </div>

      {editorOpen && (
        <dialog
          ref={dialogRef}
          className="trip-cover-dialog"
          aria-labelledby="trip-cover-heading"
          onCancel={(event) => {
            event.preventDefault();
            requestClose();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) requestClose();
          }}
        >
          <div className="trip-cover-dialog-header">
            <div>
              <h2 id="trip-cover-heading">대표 화면 설정</h2>
              <p className="meta">사진을 우선 표시하고, 사진이 없으면 대표 장소 지도를 보여줍니다.</p>
            </div>
            <button type="button" className="trip-cover-dialog-close" aria-label="대표 화면 설정 닫기" disabled={saving} onClick={requestClose}>
              ✕
            </button>
          </div>
          <TripCoverEditor
            trip={trip}
            saving={saving}
            onSave={onSave}
            onSaved={() => setEditorOpen(false)}
            onDirtyChange={(spotId, imageDataUrl) => setUnsaved(hasUnsavedChanges(trip, spotId, imageDataUrl))}
          />
        </dialog>
      )}
    </>
  );
}
