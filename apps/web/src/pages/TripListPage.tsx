import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { listTrips, deleteTrip } from "../api";

export function TripListPage({ navigate }: { navigate: (path: string) => void }) {
  const qc = useQueryClient();
  const { data: trips, error } = useQuery({
    queryKey: ["trips"],
    queryFn: listTrips,
  });

  const remove = useMutation({
    mutationFn: deleteTrip,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trips"] }),
  });

  return (
    <div className="page">
      <h1>🐾 뭉치로그</h1>
      <p className="page-actions">
        <a
          href="/new"
          onClick={(e) => {
            e.preventDefault();
            navigate("/new");
          }}
        >
          + 새 여행 만들기
        </a>
        <a
          href="/import"
          onClick={(e) => {
            e.preventDefault();
            navigate("/import");
          }}
        >
          + JSON으로 가져오기
        </a>
      </p>
      {error && <p className="error">{String((error as Error).message ?? error)}</p>}
      {!trips && !error && <p className="meta">불러오는 중...</p>}
      {trips && trips.length === 0 && (
        <p className="empty">아직 일정이 없습니다. 위 링크로 JSON을 가져오세요.</p>
      )}
      <ul>
        {trips?.map((t) => (
          <li key={t.id} className="trip-row">
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
            <button
              type="button"
              className="trip-delete"
              aria-label={`${t.title} 삭제`}
              onClick={() => {
                if (confirm(`"${t.title}"을(를) 삭제할까요?`)) remove.mutate(t.id);
              }}
            >
              삭제
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
