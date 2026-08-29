import { useState } from "react";
import { MoreVertical, X } from "lucide-react";
import type { Trip } from "../types";
import { TripCoverEditor } from "./TripCoverEditor";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

function hasUnsavedChanges(trip: Trip, spotId: string, imageDataUrl: string) {
  return (trip.cover?.spotId ?? "") !== spotId || (trip.cover?.imageDataUrl ?? "") !== imageDataUrl;
}

export function TripCoverSettingsButton({ trip, onSave, saving }: { trip: Trip; onSave: (trip: Trip) => void; saving: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [unsaved, setUnsaved] = useState(false);

  function requestClose() {
    if (saving) return;
    if (unsaved && !window.confirm("저장하지 않은 대표 화면 설정을 버릴까요?")) return;
    setEditorOpen(false);
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-lg" className="menu-button" aria-label="여행 더보기">
            <MoreVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="trip-actions-menu">
          <DropdownMenuItem onSelect={() => setEditorOpen(true)}>대표 화면 설정</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (open) setEditorOpen(true);
          else requestClose();
        }}
      >
        <DialogContent className="trip-cover-dialog" showCloseButton={false}>
          <DialogHeader className="trip-cover-dialog-header">
            <DialogTitle>대표 화면 설정</DialogTitle>
            <DialogDescription className="meta">사진을 우선 표시하고, 사진이 없으면 대표 장소 지도를 보여줍니다.</DialogDescription>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon-lg" className="trip-cover-dialog-close" aria-label="대표 화면 설정 닫기" disabled={saving} onClick={(event) => { event.preventDefault(); requestClose(); }}>
                <X aria-hidden="true" />
              </Button>
            </DialogClose>
          </DialogHeader>
          <TripCoverEditor
            trip={trip}
            saving={saving}
            onSave={onSave}
            onSaved={() => setEditorOpen(false)}
            onDirtyChange={(spotId, imageDataUrl) => setUnsaved(hasUnsavedChanges(trip, spotId, imageDataUrl))}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
