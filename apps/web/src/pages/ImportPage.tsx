import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { saveTrip } from "../api";
import { parseTripExchange } from "../tripExchange";

const PLACEHOLDER = `{
  "title": "...",
  "timezone": "Asia/Seoul",
  "currency": "JPY",
  "startDate": "2026-09-07",
  "endDate": "2026-09-12",
  "days": [ ... ]
}`;

// This is the "input platform" itself: your real itinerary never has to
// touch a git repo or a chat transcript, only this form → the DB behind
// Basic Auth. See examples/trip-sample.json in the repo for the shape
// (that fixture is fictional, not real travel data).
export function ImportPage({ navigate }: { navigate: (path: string) => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function readJson(value: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("JSON 형식이 아닙니다. 문법을 확인해주세요.");
    }
    return parseTripExchange(parsed);
  }

  async function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setError("가져올 파일은 3 MiB 이하여야 합니다.");
      return;
    }
    try {
      setText(await file.text());
    } catch {
      setError("파일을 읽지 못했습니다. JSON 파일인지 확인해주세요.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      const trip = readJson(text);
      setSubmitting(true);
      const { id } = await saveTrip(trip);
      await qc.invalidateQueries({ queryKey: ["trips"] });
      navigate(`/trips/${id}`);
    } catch (e) {
      setError(String((e as Error).message ?? e));
      return;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <p>
        <a
          href="/trips"
          onClick={(e) => {
            e.preventDefault();
            navigate("/trips");
          }}
        >
          ← 목록
        </a>
      </p>
      <h1>여행 가져오기</h1>
      <p className="meta">내보낸 단일 JSON 파일을 선택하세요. 가져오면 현재 계정의 새 여행 복사본이 되며, 원본 여행의 구성원이나 권한은 옮겨지지 않습니다.</p>
      <form onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">여행 파일</span>
          <input type="file" accept="application/json,.json" onChange={(event) => void handleFile(event.target.files?.[0])} />
        </label>
        <details>
          <summary>고급: JSON 직접 붙여넣기</summary>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={18}
          spellCheck={false}
        />
        </details>
        {error && <pre className="error">{error}</pre>}
        <button type="submit" disabled={submitting || !text.trim()}>
          {submitting ? "저장 중..." : "가져오기"}
        </button>
      </form>
    </div>
  );
}
