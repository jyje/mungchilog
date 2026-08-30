import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock3, ExternalLink, GripVertical, MoreVertical, TriangleAlert, X } from "lucide-react";
import type { Item, Spot } from "../types";
import { spotScheduleDisplay } from "../schedule";
import { OpeningHours } from "./OpeningHours";
import { SpotForm, type SpotFormValues } from "./SpotForm";
import { MarkdownView } from "./MarkdownView";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const KIND_LABEL: Record<Item["kind"], string> = { buy: "🛍️ 살 것", eat: "🍜 먹을 것", todo: "✅ 할 일" };

function googleMapsUrl(spot: Spot) {
  if (spot.placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name)}&query_place_id=${encodeURIComponent(spot.placeId)}`;
  }
  if (spot.lat != null && spot.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name)}`;
}

function AddItemForm({ onAdd, onCancel }: { onAdd: (item: Omit<Item, "id" | "done">) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<Item["kind"]>("buy");
  const [title, setTitle] = useState("");

  return (
    <li className="add-item-form">
      <select value={kind} onChange={(e) => setKind(e.target.value as Item["kind"])}>
        {(Object.keys(KIND_LABEL) as Item["kind"][]).map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={title}
        placeholder="이름"
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) {
            onAdd({ kind, title: title.trim() });
          }
          if (e.key === "Escape") onCancel();
        }}
      />
      <Button
        type="button"
        variant="default"
        onClick={() => title.trim() && onAdd({ kind, title: title.trim() })}
        disabled={!title.trim()}
      >
        추가
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        취소
      </Button>
    </li>
  );
}

export function SpotCard({
  spot,
  onToggleItem,
  onDeleteItem,
  onAddItem,
  onDeleteSpot,
  onEditSpot,
  selected,
  onSelect,
  date,
  scheduleWarning,
}: {
  spot: Spot;
  onToggleItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (item: Omit<Item, "id" | "done">) => void;
  onDeleteSpot: () => void;
  onEditSpot: (updates: SpotFormValues) => void;
  selected: boolean;
  onSelect: () => void;
  date: string;
  scheduleWarning?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: spot.id });
  const [addingItem, setAddingItem] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const schedule = spotScheduleDisplay(spot);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (editing) {
    return (
      <li ref={setNodeRef} style={style} className={`spot-card${selected ? " selected" : ""}`}>
        <span className="drag-handle" aria-hidden>
          ⠿
        </span>
        <div className="spot-body">
          <SpotForm
            initial={spot}
            submitLabel="저장"
            onSubmit={(updates) => {
              onEditSpot(updates);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      </li>
    );
  }

  return (
    <li ref={setNodeRef} style={style} className={`spot-card${selected ? " selected" : ""}`}>
      <Button type="button" variant="ghost" size="icon-lg" className="drag-handle" aria-label="순서 변경" {...attributes} {...listeners}>
        <GripVertical aria-hidden="true" />
      </Button>
      <div className="spot-body">
        <div className="spot-header">
          <Button type="button" variant={selected ? "secondary" : "ghost"} className="spot-select" onClick={onSelect} aria-pressed={selected} aria-label={`${spot.name} 지도에서 보기`}>
            <span className={`spot-schedule${schedule ? ` ${schedule.kind.toLowerCase()}` : " unscheduled"}`}>
              <Clock3 aria-hidden="true" />
              <Badge variant={schedule?.kind === "RESERVATION" ? "default" : "outline"}>
                {schedule ? `${schedule.label} ${schedule.start}` : "시간 미정"}
              </Badge>
              {schedule?.end && (
                <span className="spot-schedule-range">
                  {schedule.start}-{schedule.end}{schedule.crossesMidnight ? " (다음 날)" : ""} · {schedule.durationMinutes}분
                </span>
              )}
            </span>
            <span className="spot-name">{spot.name}</span>
            {spot.nameLocal && <span className="spot-local">{spot.nameLocal}</span>}
          </Button>
          <div className="spot-actions">
            <Button asChild variant="ghost" size="icon-lg" className="spot-map-link">
              <a
                href={googleMapsUrl(spot)}
                target="_blank"
                rel="noreferrer"
                aria-label={`${spot.name} Google 지도에서 열기 (새 창)`}
                data-place-id={spot.placeId}
              >
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-lg" className="spot-more" aria-label={`${spot.name} 더보기`}>
                  <MoreVertical aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="spot-context-menu">
                <DropdownMenuItem onSelect={() => setEditing(true)}>수정</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDeletion(true)}>삭제</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog open={confirmingDeletion} onOpenChange={setConfirmingDeletion}>
              <DialogContent className="spot-delete-dialog">
                <DialogHeader>
                  <DialogTitle>이 장소와 목록을 삭제할까요?</DialogTitle>
                  <DialogDescription>{spot.name}의 일정과 목록을 삭제합니다. 이 작업은 되돌릴 수 없습니다.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="ghost">취소</Button></DialogClose>
                  <Button type="button" variant="destructive" onClick={() => { setConfirmingDeletion(false); onDeleteSpot(); }}>삭제</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        {scheduleWarning && (
          <p className="spot-schedule-warning" role="status">
            <TriangleAlert aria-hidden="true" /> {scheduleWarning}
          </p>
        )}
        {spot.note && <MarkdownView text={spot.note} className="spot-note" />}
        <OpeningHours placeId={spot.placeId} date={date} />
        {(spot.items.length > 0 || addingItem) && (
          <ul className="item-list">
            {spot.items.map((item) => (
              <li key={item.id} className="item-row">
                <label>
                  <input type="checkbox" checked={item.done} onChange={() => onToggleItem(item.id)} />
                  <span className={item.done ? "done" : ""}>
                    {item.kind === "buy" ? "🛍️" : item.kind === "eat" ? "🍜" : "✅"} {item.title}
                    {item.price != null ? ` · ¥${item.price.toLocaleString()}` : ""}
                  </span>
                </label>
                <Button type="button" variant="ghost" size="icon-lg" className="item-delete" aria-label={`${item.title} 삭제`} onClick={() => onDeleteItem(item.id)}>
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
            {addingItem && (
              <AddItemForm
                onAdd={(item) => {
                  onAddItem(item);
                  setAddingItem(false);
                }}
                onCancel={() => setAddingItem(false)}
              />
            )}
          </ul>
        )}
        {!addingItem && (
          <Button type="button" variant="outline" className="add-item-button" onClick={() => setAddingItem(true)}>
            + 살 것/먹을 것 추가
          </Button>
        )}
      </div>
    </li>
  );
}
