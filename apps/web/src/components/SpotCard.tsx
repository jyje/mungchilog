import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Item, Spot } from "../types";
import { OpeningHours } from "./OpeningHours";

const KIND_LABEL: Record<Item["kind"], string> = { buy: "🛍️ 살 것", eat: "🍜 먹을 것", todo: "✅ 할 일" };

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
}: {
  spot: Spot;
  onToggleItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (item: Omit<Item, "id" | "done">) => void;
  onDeleteSpot: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: spot.id });
  const [addingItem, setAddingItem] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="spot-card">
      <button className="drag-handle" aria-label="순서 변경" {...attributes} {...listeners}>
        ⠿
      </button>
      <div className="spot-body">
        <div className="spot-header">
          {spot.plannedArrival && <span className="meta">{spot.plannedArrival}</span>}
          <span className="spot-name">{spot.name}</span>
          {spot.nameLocal && <span className="spot-local">{spot.nameLocal}</span>}
          <button type="button" className="spot-delete" aria-label={`${spot.name} 삭제`} onClick={onDeleteSpot}>
            ✕
          </button>
        </div>
        {spot.note && <p className="meta">{spot.note}</p>}
        <OpeningHours placeId={spot.placeId} />
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
