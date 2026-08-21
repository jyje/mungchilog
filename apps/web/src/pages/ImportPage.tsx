import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TripImportSchema } from "../types";
import { saveTrip } from "../api";

const PLACEHOLDER = `{
  "title": "...",
  "timezone": "Asia/Tokyo",
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("JSON 형식이 아닙니다. 문법을 확인해주세요.");
      return;
    }

    const validated = TripImportSchema.safeParse(parsed);
    if (!validated.success) {
      setError(validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
      return;
    }

    setSubmitting(true);
    try {
      const { id } = await saveTrip(validated.data);
      await qc.invalidateQueries({ queryKey: ["trips"] });
      navigate(`/trips/${id}`);
    } catch (e) {
      setError(String((e as Error).message ?? e));
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
      <h1>일정 가져오기</h1>
      <p className="meta">여행 일정 JSON을 붙여넣으세요. 형식은 examples/trip-sample.json 참고.</p>
      <form onSubmit={handleSubmit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={18}
          spellCheck={false}
        />
        {error && <pre className="error">{error}</pre>}
        <button type="submit" disabled={submitting || !text.trim()}>
          {submitting ? "저장 중..." : "가져오기"}
        </button>
      </form>
    </div>
  );
}
