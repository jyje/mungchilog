import { useState } from "react";
import { Download, Image, MoreVertical, PanelsTopLeft, X } from "lucide-react";
import type { Trip } from "../types";
import type { PanelPosition, TripPanelActions } from "./SplitMapShell";
import { TripCoverEditor } from "./TripCoverEditor";
import { ThemeToggleMenuItem } from "./system/ThemeToggle";
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const PANEL_LABELS: Record<PanelPosition, string> = {
  bottom: "하단",
  left: "좌측",
  right: "우측",
  floating: "플로팅",
};

function panelPosition(value: string): value is PanelPosition {
  return value === "bottom" || value === "left" || value === "right" || value === "floating";
}

function hasUnsavedChanges(trip: Trip, spotId: string, imageDataUrl: string) {
  return (trip.cover?.spotId ?? "") !== spotId || (trip.cover?.imageDataUrl ?? "") !== imageDataUrl;
}

export function TripActionsMenu({
  trip,
  onSave,
  onExport,
  saving,
  panelActions,
}: {
  trip: Trip;
  onSave: (trip: Trip) => void;
  onExport: () => void;
  saving: boolean;
  panelActions?: TripPanelActions;
}) {
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
          <Button type="button" variant="ghost" size="icon-lg" className="menu-button" aria-label="여행 더보기" title="여행 더보기">
            <MoreVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="trip-actions-menu">
          <DropdownMenuLabel>여행</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setEditorOpen(true)}>
            <Image aria-hidden="true" />
            대표 화면 설정
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onExport}>
            <Download aria-hidden="true" />
            여행 내보내기 (.json)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>화면</DropdownMenuLabel>
          {panelActions?.isWide && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PanelsTopLeft aria-hidden="true" />
                일정 패널
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="trip-panel-menu">
                <DropdownMenuCheckboxItem
                  checked={!panelActions.panelHidden}
                  onCheckedChange={(checked) => panelActions.setPanelVisible(checked === true)}
                >
                  일정 목록 표시
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={panelActions.position}
                  onValueChange={(value) => { if (panelPosition(value)) panelActions.choosePosition(value); }}
                >
                  {(Object.keys(PANEL_LABELS) as PanelPosition[]).map((position) => (
                    <DropdownMenuRadioItem key={position} value={position}>{PANEL_LABELS[position]}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <ThemeToggleMenuItem />
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
