import { useEffect, useState } from "react";
import { listTrips } from "../api";
import type { TripSummary } from "../types";

export function TripListPage({ navigate }: { navigate: (path: string) => void }) {
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTrips()
      .then(setTrips)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  return (
    <div className="page">
      <h1>🐾 뭉치로그</h1>
      <p>
        <a
          href="/import"
          onClick={(e) => {
            e.preventDefault();
            navigate("/import");
          }}
        >
          + 새 일정 가져오기
        </a>
      </p>
      {error && <p className="error">{error}</p>}
      {!trips && !error && <p className="meta">불러오는 중...</p>}
      {trips && trips.length === 0 && (
        <p className="empty">아직 일정이 없습니다. 위 링크로 JSON을 가져오세요.</p>
      )}
      <ul>
        {trips?.map((t) => (
          <li key={t.id}>
            <a
              href={`/trips/${t.id}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/trips/${t.id}`);
              }}
            >
              {t.title}
            </a>
            <div className="meta">
              {t.startDate} ~ {t.endDate}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
