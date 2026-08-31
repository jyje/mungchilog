import { GoogleAuth } from "google-auth-library";
import type { GoogleUsage, GoogleUsageAvailable, GoogleUsageService, UsageWindow } from "./admin-usage.js";

const REQUEST_METRIC = "serviceruntime.googleapis.com/api/request_count";
const LATENCY_METRIC = "serviceruntime.googleapis.com/api/request_latencies";
const CACHE_MS = 5 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 7_000;
const MAX_PAGES = 5;
const PAGE_SIZE = 1_000;

const WINDOW_MS: Record<UsageWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const ALIGNMENT_SECONDS: Record<UsageWindow, number> = {
  "24h": 60 * 60,
  "7d": 6 * 60 * 60,
  "30d": 24 * 60 * 60,
};

const SERVICE_LABELS: Record<string, string> = {
  "maps-backend.googleapis.com": "Maps JavaScript API",
  "places.googleapis.com": "Places API (New)",
  "routes.googleapis.com": "Routes API",
  "timezone-backend.googleapis.com": "Time Zone API",
};

export type GoogleMonitoringConfig = {
  enabled: boolean;
  projectId: string;
  services: string[];
};

type TimeSeriesPoint = {
  interval?: { endTime?: string };
  value?: { int64Value?: string | number; doubleValue?: number };
};

export type MonitoringTimeSeries = {
  resource?: { labels?: { service?: string } };
  metric?: { labels?: { response_code?: string } };
  points?: TimeSeriesPoint[];
};

export type TimeSeriesRequest = {
  filter: string;
  startTime: string;
  endTime: string;
  alignmentSeconds: number;
  perSeriesAligner: string;
  crossSeriesReducer: string;
  groupByFields: string[];
};

export interface MonitoringClient {
  listTimeSeries(request: TimeSeriesRequest): Promise<MonitoringTimeSeries[]>;
}

function parseServices(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))]
    .filter((service) => /^[a-z0-9.-]+\.googleapis\.com$/.test(service))
    .slice(0, 12);
}

export function googleMonitoringConfig(env: NodeJS.ProcessEnv = process.env): GoogleMonitoringConfig {
  return {
    enabled: env.USAGE_MONITORING_GOOGLE_ENABLED === "true",
    projectId: env.GOOGLE_CLOUD_PROJECT_ID?.trim() ?? "",
    services: parseServices(env.GOOGLE_MAPS_MONITORED_SERVICES),
  };
}

function serviceFilter(services: string[]): string {
  return services.map((service) => `resource.labels.service="${service}"`).join(" OR ");
}

function metricFilter(metric: string, services: string[]): string {
  return `metric.type="${metric}" AND resource.type="consumed_api" AND (${serviceFilter(services)})`;
}

function numericValue(point: TimeSeriesPoint): number | null {
  const value = point.value?.doubleValue ?? Number(point.value?.int64Value);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function serviceLabel(service: string): string {
  return SERVICE_LABELS[service] ?? service.replace(/\.googleapis\.com$/, "");
}

class GoogleCloudMonitoringClient implements MonitoringClient {
  private readonly auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/monitoring.read"] });

  constructor(private readonly projectId: string) {}

  async listTimeSeries(request: TimeSeriesRequest): Promise<MonitoringTimeSeries[]> {
    const client = await this.auth.getClient();
    const all: MonitoringTimeSeries[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await client.request<{ timeSeries?: MonitoringTimeSeries[]; nextPageToken?: string }>({
        url: `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(this.projectId)}/timeSeries`,
        method: "GET",
        timeout: PROVIDER_TIMEOUT_MS,
        retry: false,
        params: {
          filter: request.filter,
          "interval.startTime": request.startTime,
          "interval.endTime": request.endTime,
          "aggregation.alignmentPeriod": `${request.alignmentSeconds}s`,
          "aggregation.perSeriesAligner": request.perSeriesAligner,
          "aggregation.crossSeriesReducer": request.crossSeriesReducer,
          "aggregation.groupByFields": request.groupByFields,
          view: "FULL",
          pageSize: PAGE_SIZE,
          ...(pageToken ? { pageToken } : {}),
        },
      });
      all.push(...(response.data.timeSeries ?? []));
      pageToken = response.data.nextPageToken;
      if (!pageToken) return all;
    }

    throw new Error("Cloud Monitoring response exceeded the page limit");
  }
}

type ServiceAccumulator = {
  requests: number;
  errors: number;
  trend: Map<string, { requests: number; errors: number }>;
};

function accumulateRequests(
  services: string[],
  series: MonitoringTimeSeries[],
): { byService: Map<string, ServiceAccumulator>; sampledUntil: string | null } {
  const byService = new Map(services.map((service) => [service, { requests: 0, errors: 0, trend: new Map() }]));
  let sampledUntil: string | null = null;

  for (const item of series) {
    const service = item.resource?.labels?.service;
    if (!service || !byService.has(service)) continue;
    const responseCode = Number(item.metric?.labels?.response_code);
    const isError = Number.isFinite(responseCode) && responseCode >= 400;
    const accumulator = byService.get(service)!;
    for (const point of item.points ?? []) {
      const value = numericValue(point);
      const at = point.interval?.endTime;
      if (value == null || !at) continue;
      accumulator.requests += value;
      if (isError) accumulator.errors += value;
      const bucket = accumulator.trend.get(at) ?? { requests: 0, errors: 0 };
      bucket.requests += value;
      if (isError) bucket.errors += value;
      accumulator.trend.set(at, bucket);
      if (!sampledUntil || at > sampledUntil) sampledUntil = at;
    }
  }
  return { byService, sampledUntil };
}

function latencyByService(series: MonitoringTimeSeries[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of series) {
    const service = item.resource?.labels?.service;
    if (!service) continue;
    const values = (item.points ?? []).map(numericValue).filter((value): value is number => value != null);
    if (values.length > 0) result.set(service, Math.max(...values) * 1_000);
  }
  return result;
}

export async function readGoogleUsage(
  config: GoogleMonitoringConfig,
  client: MonitoringClient,
  window: UsageWindow,
  now = new Date(),
): Promise<GoogleUsageAvailable> {
  const endTime = now.toISOString();
  const startTime = new Date(now.getTime() - WINDOW_MS[window]).toISOString();
  const alignmentSeconds = ALIGNMENT_SECONDS[window];
  const common = { startTime, endTime, alignmentSeconds };

  const requests = await client.listTimeSeries({
    ...common,
    filter: metricFilter(REQUEST_METRIC, config.services),
    perSeriesAligner: "ALIGN_SUM",
    crossSeriesReducer: "REDUCE_SUM",
    groupByFields: ["resource.labels.service", "metric.labels.response_code"],
  });
  const [p50Result, p95Result] = await Promise.allSettled([
    client.listTimeSeries({
      ...common,
      alignmentSeconds: WINDOW_MS[window] / 1_000,
      filter: metricFilter(LATENCY_METRIC, config.services),
      perSeriesAligner: "ALIGN_PERCENTILE_50",
      crossSeriesReducer: "REDUCE_PERCENTILE_50",
      groupByFields: ["resource.labels.service"],
    }),
    client.listTimeSeries({
      ...common,
      alignmentSeconds: WINDOW_MS[window] / 1_000,
      filter: metricFilter(LATENCY_METRIC, config.services),
      perSeriesAligner: "ALIGN_PERCENTILE_95",
      crossSeriesReducer: "REDUCE_PERCENTILE_95",
      groupByFields: ["resource.labels.service"],
    }),
  ]);

  const { byService, sampledUntil } = accumulateRequests(config.services, requests);
  const p50 = latencyByService(p50Result.status === "fulfilled" ? p50Result.value : []);
  const p95 = latencyByService(p95Result.status === "fulfilled" ? p95Result.value : []);
  const services: GoogleUsageService[] = config.services.map((service) => {
    const usage = byService.get(service)!;
    return {
      service,
      label: serviceLabel(service),
      requests: usage.requests,
      errors: usage.errors,
      errorRate: usage.requests > 0 ? usage.errors / usage.requests : 0,
      latencyMs: { p50: p50.get(service) ?? null, p95: p95.get(service) ?? null },
      quota: null,
      trend: [...usage.trend.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([at, values]) => ({ at, ...values })),
    };
  });

  // Request metrics can be invisible for up to 30 minutes. When the selected
  // period is empty, expose a conservative sampling cutoff instead of
  // claiming that the current instant has been fully processed.
  return {
    status: "available",
    sampledUntil: sampledUntil ?? new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    services,
  };
}

type CacheEntry = { expiresAt: number; value: GoogleUsage };

export class GoogleUsageProvider {
  private readonly cache = new Map<UsageWindow, CacheEntry>();
  private readonly inflight = new Map<UsageWindow, Promise<GoogleUsage>>();
  private readonly client: MonitoringClient | null;

  constructor(
    private readonly config: GoogleMonitoringConfig,
    client?: MonitoringClient,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.client = config.enabled && config.projectId && config.services.length > 0
      ? client ?? new GoogleCloudMonitoringClient(config.projectId)
      : null;
  }

  async get(window: UsageWindow): Promise<GoogleUsage> {
    if (!this.client) return { status: "disabled", reason: "not-configured" };
    const now = this.now();
    const cached = this.cache.get(window);
    if (cached && cached.expiresAt > now.getTime()) return cached.value;
    const current = this.inflight.get(window);
    if (current) return current;

    const request = readGoogleUsage(this.config, this.client, window, now)
      .then<GoogleUsage>((value) => value)
      .catch<GoogleUsage>(() => ({ status: "unavailable", reason: "provider-error" }))
      .then((value) => {
        this.cache.set(window, { expiresAt: this.now().getTime() + CACHE_MS, value });
        return value;
      })
      .finally(() => this.inflight.delete(window));
    this.inflight.set(window, request);
    return request;
  }
}

export const googleUsageProvider = new GoogleUsageProvider(googleMonitoringConfig());
