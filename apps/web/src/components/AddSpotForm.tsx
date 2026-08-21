import { useState } from "react";
import type { Spot } from "../types";

export function AddSpotForm({
  onAdd,
  onCancel,
}: {
  onAdd: (spot: Omit<Spot, "id" | "order" | "items" | "bufferMinutes">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [nameLocal, setNameLocal] = useState("");
  const [plannedArrival, setPlannedArrival] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      nameLocal: nameLocal.trim() || undefined,
      plannedArrival: plannedArrival || undefined,
      note: note.trim() || undefined,
    });
  }

  return (
    <li className="add-spot-form">
      <input type="text" placeholder="장소 이름" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <input type="text" placeholder="현지어 이름 (선택)" value={nameLocal} onChange={(e) => setNameLocal(e.target.value)} />
      <div className="add-spot-row">
        <input type="time" value={plannedArrival} onChange={(e) => setPlannedArrival(e.target.value)} />
        <input type="text" placeholder="메모 (선택)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="add-spot-row">
        <button type="button" onClick={submit} disabled={!name.trim()}>
          스팟 추가
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          취소
        </button>
      </div>
    </li>
  );
}
