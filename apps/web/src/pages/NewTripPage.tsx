import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { saveTrip } from "../api";

// The other way to get a trip in: a plain form instead of pasting JSON.
// Creates an empty trip (no days yet) and hands off to the day view,
// where "+ 날짜 추가" / "+ 스팟 추가" build it out from there.
export function NewTripPage({ navigate }: { navigate: (path: string) => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !startDate || !endDate) {
      setError("제목과 시작일·종료일을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await saveTrip({
        title: title.trim(),
        timezone: "Asia/Tokyo",
        currency: "JPY",
        startDate,
        endDate,
        days: [],
      });
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
      <h1>새 여행 만들기</h1>
      <p className="meta">날짜와 스팟은 다음 화면에서 하나씩 추가합니다. 통째로 넣으려면 JSON 가져오기를 쓰세요.</p>
      <form onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">제목</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="도쿄·오사카 5박6일" />
        </label>
        <label className="field">
          <span className="field-label">시작일</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">종료일</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "만드는 중..." : "만들기"}
        </button>
      </form>
    </div>
  );
}
