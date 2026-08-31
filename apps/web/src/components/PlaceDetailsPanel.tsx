import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPin, Phone, Plus, RotateCcw, X } from "lucide-react";
import type { PlaceSelection } from "./PlaceAutocompleteInput";
import type { MapPlaceSelection } from "./TripMap";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";

export type PlaceDetails = {
  id: string;
  displayName: string | null;
  formattedAddress: string | null;
  location: { latitude: number; longitude: number } | null;
  category: string | null;
  rating: number | null;
  userRatingCount: number | null;
  regularOpeningHours: { weekdayDescriptions?: string[] } | null;
  websiteUri: string | null;
  nationalPhoneNumber: string | null;
  googleMapsUri: string | null;
};

type PlaceDetailsResponse = {
  details: PlaceDetails;
  fetchedAt: string;
  freshness: "current" | "stale";
} | null;

async function fetchPlaceDetails(placeId: string): Promise<PlaceDetailsResponse> {
  const response = await fetch(`/api/places/${encodeURIComponent(placeId)}/details`);
  if (response.status === 501) {
    const body = await response.json().catch(() => ({}));
    return body.cached ? { ...body.cached, freshness: "stale" as const } : null;
  }
  if (!response.ok) throw new Error("장소 정보를 불러오지 못했습니다.");
  const body = await response.json();
  return {
    ...body,
    freshness: response.headers.get("X-Cache") === "stale" ? "stale" : "current",
  };
}

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function PlaceDetailsPanel({ selection, onAdd, onClose, canAdd = true }: {
  selection: MapPlaceSelection | null;
  onAdd: (place: PlaceSelection) => void;
  onClose: () => void;
  canAdd?: boolean;
}) {
  const query = useQuery({
    queryKey: ["places", selection?.placeId, "details"],
    queryFn: () => fetchPlaceDetails(selection!.placeId),
    enabled: !!selection,
    staleTime: 1000 * 60 * 60 * 24 * 30,
  });

  if (!selection) {
    return (
      <div className="place-details-empty">
        <MapPin aria-hidden="true" />
        <h2>지도에서 장소를 선택하세요.</h2>
        <p>상점, 관광지, 역 같은 Google 지도 장소를 누르면 정보를 확인한 뒤 일정에 추가할 수 있습니다.</p>
      </div>
    );
  }

  if (query.isPending) {
    return <div className="place-details-card" aria-label="장소 정보 불러오는 중">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>;
  }

  const details = query.data?.details;
  if (query.isError || !details) {
    return <div className="place-details-empty" role="alert">
      <h2>장소 정보를 불러오지 못했습니다.</h2>
      <p>지도 선택은 유지했습니다. 잠시 후 다시 시도하거나 좌표 장소로 직접 추가할 수 있습니다.</p>
      <div className="place-details-actions">
        <Button type="button" variant="outline" onClick={() => query.refetch()}><RotateCcw aria-hidden="true" /> 다시 시도</Button>
        <Button type="button" variant="ghost" onClick={onClose}>닫기</Button>
      </div>
    </div>;
  }

  const latitude = details.location?.latitude ?? selection.lat;
  const longitude = details.location?.longitude ?? selection.lng;
  const name = details.displayName ?? "선택한 장소";
  const website = safeExternalUrl(details.websiteUri);
  const googleMaps = safeExternalUrl(details.googleMapsUri);
  const hours = details.regularOpeningHours?.weekdayDescriptions;

  return (
    <article className="place-details-card" aria-labelledby="selected-place-name">
      <div className="place-details-heading">
        <div>
          {details.category && <Badge variant="secondary">{details.category}</Badge>}
          <h2 id="selected-place-name">{name}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="선택한 장소 닫기" onClick={onClose}><X aria-hidden="true" /></Button>
      </div>
      {details.formattedAddress && <p className="place-details-address"><MapPin aria-hidden="true" /> {details.formattedAddress}</p>}
      {query.data?.freshness === "stale" && (
        <p className="meta place-details-stale" role="status">
          저장된 장소 정보입니다. 제공자 연결이 복구되면 최신 정보로 갱신됩니다.
        </p>
      )}
      {(details.rating != null || details.userRatingCount != null) && (
        <p className="place-details-rating" aria-label={`평점 ${details.rating ?? "정보 없음"}, 리뷰 ${details.userRatingCount ?? "정보 없음"}개`}>
          ★ {details.rating?.toFixed(1) ?? "-"} {details.userRatingCount != null && <span>리뷰 {details.userRatingCount.toLocaleString()}개</span>}
        </p>
      )}
      {hours?.length ? <>
        <Separator />
        <section className="place-details-hours" aria-labelledby="place-hours-title">
          <h3 id="place-hours-title">영업시간</h3>
          <ul>{hours.map((line) => <li key={line}>{line}</li>)}</ul>
        </section>
      </> : null}
      {(details.nationalPhoneNumber || website || googleMaps) && <>
        <Separator />
        <div className="place-details-links">
          {details.nationalPhoneNumber && <a href={`tel:${details.nationalPhoneNumber}`}><Phone aria-hidden="true" /> {details.nationalPhoneNumber}</a>}
          {website && <a href={website} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /> 웹사이트</a>}
          {googleMaps && <a href={googleMaps} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /> Google 지도</a>}
        </div>
      </>}
      {!canAdd && <p className="meta">먼저 일정 날짜를 추가해주세요.</p>}
      <Button type="button" className="place-details-add" disabled={!canAdd} onClick={() => onAdd({
        name,
        placeId: details.id || selection.placeId,
        lat: latitude,
        lng: longitude,
        category: details.category ?? undefined,
      })}>
        <Plus aria-hidden="true" /> 일정에 추가
      </Button>
    </article>
  );
}
