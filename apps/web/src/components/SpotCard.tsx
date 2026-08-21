import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Spot } from "../types";

export function SpotCard({ spot, onToggleItem }: { spot: Spot; onToggleItem: (itemId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: spot.id });

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
        </div>
        {spot.note && <p className="meta">{spot.note}</p>}
        {spot.items.length > 0 && (
          <ul className="item-list">
            {spot.items.map((item) => (
              <li key={item.id}>
                <label>
                  <input type="checkbox" checked={item.done} onChange={() => onToggleItem(item.id)} />
                  <span className={item.done ? "done" : ""}>
                    {item.kind === "buy" ? "🛍️" : item.kind === "eat" ? "🍜" : "✅"} {item.title}
                    {item.price != null ? ` · ¥${item.price.toLocaleString()}` : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
