import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Cloud, Database, RefreshCw, Route, Users } from "lucide-react";
import {
  adminApproveUser,
  adminGetUsage,
  adminListUsers,
  adminRejectUser,
  type AdminUsage,
  type AdminUsageWindow,
  type Me,
} from "../api";
import { UsageSparkline } from "../components/system/UsageSparkline";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

const WINDOWS: Array<{ value: AdminUsageWindow; label: string }> = [
  { value: "24h", label: "24시간" },
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
];

function UsersAdmin({ users, error }: { users: Me[] | undefined; error: Error | null }) {
  const qc = useQueryClient();
  const approve = useMutation({
    mutationFn: adminApproveUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  const reject = useMutation({
    mutationFn: adminRejectUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  if (error) return <p className="error" role="alert">{error.message}</p>;
  if (!users) return <p className="meta" role="status">사용자를 불러오는 중입니다.</p>;
  const pending = users.filter((user) => user.status === "pending");
  const approved = users.filter((user) => user.status === "approved");

  return (
    <div className="admin-users">
      <section aria-labelledby="pending-users-heading">
        <h2 id="pending-users-heading">승인 대기 ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="empty">대기 중인 사용자가 없습니다.</p>
        ) : (
          <ul>
            {pending.map((user) => (
              <li key={user.id} className="admin-user-row">
                <span className="admin-user-identity">
                  {user.name ?? user.email}
                  {user.name ? <span className="meta">{user.email}</span> : null}
                </span>
                <div className="admin-user-actions">
                  <Button type="button" onClick={() => approve.mutate(user.id)} disabled={approve.isPending}>승인</Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`${user.email}의 가입 요청을 거절할까요?`)) reject.mutate(user.id);
                    }}
                    disabled={reject.isPending}
                  >
                    거절
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="approved-users-heading">
        <h2 id="approved-users-heading">승인됨 ({approved.length})</h2>
        <ul>
          {approved.map((user) => (
            <li key={user.id} className="admin-user-row">
              <span className="admin-user-identity">
                {user.name ?? user.email}
                {user.name || user.role === "admin" ? (
                  <span className="meta">{user.name ? user.email : null}{user.role === "admin" ? `${user.name ? " · " : ""}관리자` : ""}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <p className="meta">여행을 특정 사용자와 같이 보려면 여행 화면의 초대 메뉴를 이용하세요.</p>
    </div>
  );
}

function MetricCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return (
    <article className="usage-metric-card">
      <div className="usage-metric-heading">{icon}<span>{label}</span></div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function ApplicationUsageCards({ usage }: { usage: AdminUsage["application"] }) {
  return (
    <section aria-labelledby="application-usage-heading">
      <div className="usage-section-heading">
        <div><Database aria-hidden="true" /><h2 id="application-usage-heading">애플리케이션</h2></div>
        <span className="usage-source">뭉치로그 데이터베이스</span>
      </div>
      <div className="usage-card-grid">
        <MetricCard label="승인된 사용자" value={usage.users.approved.toLocaleString()} detail={`승인 대기 ${usage.users.pending.toLocaleString()}명`} icon={<Users aria-hidden="true" />} />
        <MetricCard label="여행" value={usage.trips.toLocaleString()} detail={`멤버십 ${usage.memberships.toLocaleString()}개`} icon={<Route aria-hidden="true" />} />
        <MetricCard label="경로 캐시" value={`${usage.routeCache.freshEntries.toLocaleString()} / ${usage.routeCache.entries.toLocaleString()}`} detail="최근 30일 / 전체" icon={<Activity aria-hidden="true" />} />
        <MetricCard label="장소 캐시" value={`${usage.placeCache.freshEntries.toLocaleString()} / ${usage.placeCache.entries.toLocaleString()}`} detail="최근 30일 / 전체" icon={<Cloud aria-hidden="true" />} />
      </div>
    </section>
  );
}

function formatLatency(value: number | null): string {
  if (value == null) return "정보 없음";
  return value >= 1_000 ? `${(value / 1_000).toFixed(1)}초` : `${Math.round(value)}ms`;
}

function isMonitoringDelayed(sampledUntil: string): boolean {
  const sampledAt = Date.parse(sampledUntil);
  return Number.isFinite(sampledAt) && Date.now() - sampledAt > 45 * 60 * 1_000;
}

function GoogleUsageSection({ google, retry }: { google: AdminUsage["google"]; retry: () => void }) {
  if (google.status === "disabled") {
    return (
      <section className="usage-provider-state" aria-labelledby="google-usage-heading">
        <Cloud aria-hidden="true" />
        <div><h2 id="google-usage-heading">Google API 사용량</h2><p>Cloud Monitoring 연동이 아직 설정되지 않았습니다. 사용자 관리와 애플리케이션 집계는 계속 사용할 수 있습니다.</p></div>
      </section>
    );
  }
  if (google.status === "unavailable") {
    return (
      <section className="usage-provider-state error-state" aria-labelledby="google-usage-heading">
        <Cloud aria-hidden="true" />
        <div><h2 id="google-usage-heading">Google API 사용량을 불러오지 못했습니다</h2><p>잠시 후 다시 시도하세요. 자격 증명이나 공급자 오류의 상세 내용은 브라우저에 노출하지 않습니다.</p></div>
        <Button type="button" variant="outline" onClick={retry}><RefreshCw aria-hidden="true" /> 다시 시도</Button>
      </section>
    );
  }

  const delayed = isMonitoringDelayed(google.sampledUntil);
  return (
    <section aria-labelledby="google-usage-heading">
      <div className="usage-section-heading">
        <div><Cloud aria-hidden="true" /><h2 id="google-usage-heading">Google API</h2></div>
        <span className="usage-source">Cloud Monitoring · {new Date(google.sampledUntil).toLocaleString("ko-KR")}까지 반영</span>
      </div>
      <p className={`meta usage-delay-note${delayed ? " is-delayed" : ""}`} role={delayed ? "status" : undefined}>
        {delayed ? "최근 지표가 평소보다 늦게 도착하고 있습니다. 마지막 수집 시각을 기준으로 확인하세요." : "Google 지표는 최대 약 30분 늦게 반영될 수 있습니다."}
      </p>
      {google.services.length === 0 ? (
        <div className="usage-provider-state usage-empty-state">
          <Activity aria-hidden="true" />
          <div><h3>선택한 기간에 수집된 요청이 없습니다</h3><p>서비스가 사용되면 요청 수와 지연시간 추이가 이곳에 표시됩니다.</p></div>
        </div>
      ) : (
        <div className="usage-service-grid">
          {google.services.map((service) => (
          <article key={service.service} className="usage-service-card">
            <header><h3>{service.label}</h3><span>{service.requests.toLocaleString()}건</span></header>
            <UsageSparkline label={service.label} trend={service.trend} />
            <dl>
              <div><dt>오류</dt><dd>{service.errors.toLocaleString()}건 · {(service.errorRate * 100).toFixed(1)}%</dd></div>
              <div><dt>지연시간</dt><dd>p50 {formatLatency(service.latencyMs.p50)} · p95 {formatLatency(service.latencyMs.p95)}</dd></div>
              <div><dt>할당량</dt><dd>{service.quota ? `${(service.quota.ratio * 100).toFixed(1)}%` : "live 검증 대기"}</dd></div>
            </dl>
          </article>
          ))}
        </div>
      )}
    </section>
  );
}

function UsageAdmin() {
  const [window, setWindow] = useState<AdminUsageWindow>("24h");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "usage", window], queryFn: () => adminGetUsage(window) });
  const refresh = useMutation({
    mutationFn: () => adminGetUsage(window, true),
    onSuccess: (data) => queryClient.setQueryData(["admin", "usage", window], data),
  });

  return (
    <div className="admin-usage">
      <div className="usage-toolbar">
        <div className="usage-window-picker" role="group" aria-label="사용량 조회 기간">
          {WINDOWS.map((option) => (
            <Button key={option.value} type="button" size="sm" variant={window === option.value ? "secondary" : "outline"} aria-pressed={window === option.value} onClick={() => setWindow(option.value)}>
              {option.label}
            </Button>
          ))}
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => refresh.mutate()} disabled={query.isFetching || refresh.isPending}>
          <RefreshCw className={query.isFetching || refresh.isPending ? "usage-refreshing" : ""} aria-hidden="true" /> 새로고침
        </Button>
      </div>

      {query.isPending ? <p className="meta usage-loading" role="status">사용량을 불러오는 중입니다.</p> : null}
      {query.error ? <div className="usage-provider-state error-state" role="alert"><p>사용량을 불러오지 못했습니다.</p><Button type="button" variant="outline" onClick={() => query.refetch()}>다시 시도</Button></div> : null}
      {refresh.error ? <p className="error" role="alert">새로고침하지 못했습니다. 기존 지표를 계속 표시합니다.</p> : null}
      {query.data ? (
        <div className="usage-sections">
          <p className="meta">{new Date(query.data.generatedAt).toLocaleString("ko-KR")}에 조회 · {WINDOWS.find((option) => option.value === query.data.window)?.label}</p>
          <ApplicationUsageCards usage={query.data.application} />
          <GoogleUsageSection google={query.data.google} retry={() => refresh.mutate()} />
        </div>
      ) : null}
    </div>
  );
}

export function AdminPage() {
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: adminListUsers });
  return (
    <div className="page admin-page">
      <div className="admin-page-heading">
        <p className="eyebrow">서비스 관리</p>
        <h1>관리자</h1>
        <p className="meta">계정 승인과 서비스 사용 현황을 한곳에서 관리합니다.</p>
      </div>
      <Tabs defaultValue="users" className="admin-tabs">
        <TabsList variant="line" aria-label="관리자 기능">
          <TabsTrigger value="users"><Users aria-hidden="true" /> 사용자</TabsTrigger>
          <TabsTrigger value="usage"><Activity aria-hidden="true" /> 사용량</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersAdmin users={users.data} error={users.error} /></TabsContent>
        <TabsContent value="usage"><UsageAdmin /></TabsContent>
      </Tabs>
    </div>
  );
}
