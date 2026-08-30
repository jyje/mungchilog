import { ChevronDown } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { listTrips, deleteTrip } from "../api";
import { MapsScope } from "../components/MapsScope";
import { TripCoverMap } from "../components/TripCoverMap";
import { BuildIdentity } from "../components/system/BuildIdentity";
import { Button } from "../components/ui/button";
import { ButtonGroup } from "../components/ui/button-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";

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
    <MapsScope>
      <div className="page trip-library">
        <header className="trip-library-header">
          <div>
            <h1>뭉치로그</h1>
            <p className="meta">내가 참여한 여행만 표시됩니다.</p>
          </div>
          <div className="trip-library-actions">
            <ButtonGroup className="trip-new-trip-group">
              <Button asChild variant="outline" className="trip-new-trip-primary">
                <a href="/new" onClick={(e) => { e.preventDefault(); navigate("/new"); }}>새 여행 만들기</a>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="새 여행 만들기 옵션 더 보기">
                    <ChevronDown aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="trip-actions-menu">
                  <DropdownMenuItem onSelect={() => navigate("/import")}>JSON 가져오기</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>
          </div>
        </header>
        {error && <p className="error">{String((error as Error).message ?? error)}</p>}
        {!trips && !error && <p className="meta">여행을 불러오는 중...</p>}
        {trips && trips.length === 0 && <p className="empty">아직 참여한 여행이 없습니다. 새 여행을 만들거나 JSON 일정을 가져오세요.</p>}
        <div className="trip-library-grid">
          {trips?.map((trip) => (
            <article key={trip.id} className="trip-library-card">
              <a
                className="trip-library-link"
                href={`/trips/${trip.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(`/trips/${trip.id}`);
                }}
              >
                <div className="trip-library-visual">
                  {trip.cover?.imageDataUrl ? (
                    <img src={trip.cover.imageDataUrl} alt={`${trip.title} 대표 이미지`} />
                  ) : trip.cover?.spot ? (
                    <TripCoverMap spot={trip.cover.spot} />
                  ) : (
                    <div className="trip-cover-map-fallback">대표 장소나 이미지를 추가하면 여행을 한눈에 구분할 수 있습니다.</div>
                  )}
                </div>
                <div className="trip-library-card-body">
                  <div>
                    <h2>{trip.title}</h2>
                    <p className="meta">{trip.startDate} - {trip.endDate}</p>
                  </div>
                  {trip.cover?.spot && <p className="trip-library-place">대표 장소: {trip.cover.spot.nameLocal || trip.cover.spot.name}</p>}
                </div>
              </a>
              <button
                type="button"
                className="trip-delete"
                aria-label={`${trip.title} 삭제`}
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm(`"${trip.title}"을(를) 삭제할까요?`)) remove.mutate(trip.id);
                }}
              >
                삭제
              </button>
            </article>
          ))}
        </div>
        <BuildIdentity />
      </div>
    </MapsScope>
  );
}
