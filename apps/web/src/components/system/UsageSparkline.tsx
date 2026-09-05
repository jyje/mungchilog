import type { AdminUsageService } from "../../api";

export function UsageSparkline({ label, trend }: Pick<AdminUsageService, "label" | "trend">) {
  const max = Math.max(1, ...trend.map((point) => point.requests));
  const total = trend.reduce((sum, point) => sum + point.requests, 0);
  const peak = trend.reduce((highest, point) => point.requests > highest.requests ? point : highest, trend[0] ?? { at: "", requests: 0, errors: 0 });
  const description = trend.length === 0
    ? `${label}: 선택한 기간에 요청이 없습니다.`
    : `${label}: ${trend.length}개 구간에서 요청 ${total.toLocaleString()}건, 최대 구간 ${peak.requests.toLocaleString()}건.`;

  return (
    <div className="usage-sparkline" role="img" aria-label={description}>
      {trend.length === 0 ? (
        <span className="usage-sparkline-empty" aria-hidden="true" />
      ) : trend.map((point) => (
        <span
          key={point.at}
          className={`usage-sparkline-bar${point.errors > 0 ? " has-errors" : ""}`}
          style={{ height: `${Math.max(8, (point.requests / max) * 100)}%` }}
          title={`${new Date(point.at).toLocaleString("ko-KR")}: ${point.requests.toLocaleString()}건, 오류 ${point.errors.toLocaleString()}건`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
