import { useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Item, Spot } from "../types";
import { OpeningHours } from "./OpeningHours";
import { SpotForm, type SpotFormValues } from "./SpotForm";
import { MarkdownView } from "./MarkdownView";

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
      <button
        type="button"
        onClick={() => title.trim() && onAdd({ kind, title: title.trim() })}
        disabled={!title.trim()}
      >
        추가
      </button>
      <button type="button" className="ghost" onClick={onCancel}>
        취소
      </button>
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
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: spot.id });
  const [addingItem, setAddingItem] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
    setConfirmingDeletion(false);
  }

  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

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
      <button className="drag-handle" aria-label="순서 변경" {...attributes} {...listeners}>
        ⠿
      </button>
      <div className="spot-body">
        <div className="spot-header">
          <button type="button" className="spot-select" onClick={onSelect} aria-pressed={selected} aria-label={`${spot.name} 지도에서 보기`}>
            {spot.plannedArrival && <span className="meta">{spot.plannedArrival}</span>}
            <span className="spot-name">{spot.name}</span>
            {spot.nameLocal && <span className="spot-local">{spot.nameLocal}</span>}
          </button>
          <div className="spot-actions">
            <a
              className="spot-map-link"
              href={googleMapsUrl(spot)}
              target="_blank"
              rel="noreferrer"
              aria-label={`${spot.name} Google 지도에서 열기 (새 창)`}
              data-place-id={spot.placeId}
            >
              ↗
            </a>
            <button
              type="button"
              className="spot-more"
              aria-label={`${spot.name} 더보기`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => {
                setMenuOpen((open) => !open);
                setConfirmingDeletion(false);
              }}
            >
              ⋮
            </button>
            {menuOpen && (
              <>
                <button type="button" className="spot-menu-backdrop" aria-label="장소 메뉴 닫기" onClick={closeMenu} />
                <div className="spot-context-menu" role={confirmingDeletion ? "dialog" : "menu"} aria-label={`${spot.name} 메뉴`}>
                  {confirmingDeletion ? (
                    <>
                      <p>이 장소와 목록을 삭제할까요?</p>
                      <div className="spot-context-actions">
                        <button type="button" onClick={closeMenu}>취소</button>
                        <button type="button" className="danger" onClick={onDeleteSpot}>삭제</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          closeMenu();
                          setEditing(true);
                        }}
                      >
                        수정
                      </button>
                      <button type="button" role="menuitem" className="danger" onClick={() => setConfirmingDeletion(true)}>
                        삭제
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
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
                <button type="button" className="item-delete" aria-label={`${item.title} 삭제`} onClick={() => onDeleteItem(item.id)}>
                  ✕
                </button>
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
          <button type="button" className="add-item-button" onClick={() => setAddingItem(true)}>
            + 살 것/먹을 것 추가
          </button>
        )}
      </div>
    </li>
  );
}
