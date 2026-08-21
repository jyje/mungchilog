import { useQuery } from "@tanstack/react-query";

type OpeningHoursData = {
  regularOpeningHours: { weekdayDescriptions?: string[] } | null;
  fetchedAt: string;
} | null;

async function fetchHours(placeId: string): Promise<OpeningHoursData> {
  const res = await fetch(`/api/places/${encodeURIComponent(placeId)}/hours`);
  if (res.status === 501) {
    const body = await res.json().catch(() => ({}));
    return body.cached ?? null;
  }
  if (!res.ok) return null;
  return res.json();
}

// "오늘 여는가"가 실전에서 제일 자주 보는 정보 (PLAN.md) - 그래서 이 정보만
// 보여준다. 전체 영업시간표는 오버킬.
export function OpeningHours({ placeId }: { placeId?: string }) {
  const { data } = useQuery({
    queryKey: ["places", placeId, "hours"],
    queryFn: () => fetchHours(placeId!),
    enabled: !!placeId,
    staleTime: 1000 * 60 * 60 * 24 * 30,
  });

  if (!placeId) return null;
  const descriptions = data?.regularOpeningHours?.weekdayDescriptions;
  if (!descriptions || descriptions.length !== 7) return null;

  // Google's weekdayDescriptions is Monday-first; JS getDay() is Sunday-first (0-6).
  const jsDay = new Date().getDay();
  const googleIndex = jsDay === 0 ? 6 : jsDay - 1;
  const today = descriptions[googleIndex];

  return <div className="opening-hours meta">🕐 {today}</div>;
}
