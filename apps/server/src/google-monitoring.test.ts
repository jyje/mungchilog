import assert from "node:assert/strict";
import test from "node:test";
import {
  googleMonitoringConfig,
  GoogleUsageProvider,
  readGoogleUsage,
  type MonitoringClient,
  type MonitoringTimeSeries,
  type TimeSeriesRequest,
} from "./google-monitoring.js";

const config = {
  enabled: true,
  projectId: "maps-project",
  services: ["routes.googleapis.com", "places.googleapis.com"],
};

function series(service: string, responseCode: string | undefined, points: Array<[string, number]>): MonitoringTimeSeries {
  return {
    resource: { labels: { service } },
    metric: { labels: responseCode ? { response_code: responseCode } : {} },
    points: points.map(([endTime, value]) => ({ interval: { endTime }, value: { doubleValue: value } })),
  };
}

test("monitoring configuration is explicit and filters malformed service names", () => {
  assert.deepEqual(googleMonitoringConfig({}), { enabled: false, projectId: "", services: [] });
  assert.deepEqual(googleMonitoringConfig({
    USAGE_MONITORING_GOOGLE_ENABLED: "true",
    GOOGLE_CLOUD_PROJECT_ID: " project-one ",
    GOOGLE_MAPS_MONITORED_SERVICES: "routes.googleapis.com, invalid service, routes.googleapis.com,places.googleapis.com",
  }), {
    enabled: true,
    projectId: "project-one",
    services: ["routes.googleapis.com", "places.googleapis.com"],
  });
});

test("Cloud Monitoring series become bounded per-service usage", async () => {
  const requests: TimeSeriesRequest[] = [];
  const client: MonitoringClient = {
    async listTimeSeries(request) {
      requests.push(request);
      if (request.filter.includes("request_count")) {
        return [
          series("routes.googleapis.com", "200", [["2026-08-30T23:00:00.000Z", 8], ["2026-08-31T00:00:00.000Z", 10]]),
          series("routes.googleapis.com", "500", [["2026-08-31T00:00:00.000Z", 2]]),
          series("places.googleapis.com", "200", [["2026-08-31T00:00:00.000Z", 4]]),
          series("unlisted.googleapis.com", "200", [["2026-08-31T00:00:00.000Z", 999]]),
        ];
      }
      const value = request.perSeriesAligner === "ALIGN_PERCENTILE_50" ? 0.125 : 0.4;
      return [series("routes.googleapis.com", undefined, [["2026-08-31T00:00:00.000Z", value]])];
    },
  };

  const result = await readGoogleUsage(config, client, "24h", new Date("2026-08-31T00:05:00.000Z"));

  assert.equal(result.status, "available");
  assert.equal(result.sampledUntil, "2026-08-31T00:00:00.000Z");
  assert.deepEqual(result.services[0], {
    service: "routes.googleapis.com",
    label: "Routes API",
    requests: 20,
    errors: 2,
    errorRate: 0.1,
    latencyMs: { p50: 125, p95: 400 },
    quota: null,
    trend: [
      { at: "2026-08-30T23:00:00.000Z", requests: 8, errors: 0 },
      { at: "2026-08-31T00:00:00.000Z", requests: 12, errors: 2 },
    ],
  });
  assert.equal(result.services[1].requests, 4);
  assert.equal(requests.length, 3);
  assert.match(requests[0].filter, /routes\.googleapis\.com/);
  assert.match(requests[0].filter, /places\.googleapis\.com/);
  assert.equal(requests[0].alignmentSeconds, 3_600);
  assert.equal(requests[1].alignmentSeconds, 86_400);
});

test("latency failures preserve request metrics as a partial result", async () => {
  const client: MonitoringClient = {
    async listTimeSeries(request) {
      if (request.filter.includes("request_latencies")) throw new Error("fixture provider failure");
      return [series("routes.googleapis.com", "200", [["2026-08-31T00:00:00.000Z", 1]])];
    },
  };
  const result = await readGoogleUsage(config, client, "24h", new Date("2026-08-31T00:05:00.000Z"));
  assert.equal(result.services[0].requests, 1);
  assert.deepEqual(result.services[0].latencyMs, { p50: null, p95: null });
});

test("empty periods expose a conservative provider sampling cutoff", async () => {
  const client: MonitoringClient = { listTimeSeries: async () => [] };
  const result = await readGoogleUsage(config, client, "7d", new Date("2026-08-31T00:00:00.000Z"));
  assert.equal(result.sampledUntil, "2026-08-30T23:30:00.000Z");
  assert.equal(result.services[0].requests, 0);
});

test("the provider disables incomplete configuration without calling Google", async () => {
  let calls = 0;
  const client: MonitoringClient = { listTimeSeries: async () => { calls += 1; return []; } };
  const provider = new GoogleUsageProvider({ enabled: true, projectId: "", services: [] }, client);
  assert.deepEqual(await provider.get("24h"), { status: "disabled", reason: "not-configured" });
  assert.equal(calls, 0);
});

test("the provider coalesces concurrent work and caches each window for five minutes", async () => {
  let calls = 0;
  let now = new Date("2026-08-31T00:00:00.000Z");
  const client: MonitoringClient = {
    async listTimeSeries() {
      calls += 1;
      return [];
    },
  };
  const provider = new GoogleUsageProvider(config, client, () => now);

  await Promise.all([provider.get("24h"), provider.get("24h")]);
  assert.equal(calls, 3);
  await provider.get("24h");
  assert.equal(calls, 3);
  await provider.get("24h", true);
  assert.equal(calls, 6);
  await provider.get("7d");
  assert.equal(calls, 9);
  now = new Date("2026-08-31T00:05:01.000Z");
  await provider.get("24h");
  assert.equal(calls, 12);
});

test("provider failures are non-sensitive and cached", async () => {
  let calls = 0;
  const client: MonitoringClient = {
    async listTimeSeries() {
      calls += 1;
      throw new Error("credential path and provider response must not escape");
    },
  };
  const provider = new GoogleUsageProvider(config, client, () => new Date("2026-08-31T00:00:00.000Z"));
  assert.deepEqual(await provider.get("30d"), { status: "unavailable", reason: "provider-error" });
  assert.deepEqual(await provider.get("30d"), { status: "unavailable", reason: "provider-error" });
  assert.equal(calls, 1);
});

test("an overall deadline bounds a stalled monitoring provider", async () => {
  const client: MonitoringClient = {
    listTimeSeries: async () => new Promise<MonitoringTimeSeries[]>(() => {}),
  };
  const provider = new GoogleUsageProvider(config, client, () => new Date("2026-08-31T00:00:00.000Z"), 10);

  assert.deepEqual(await provider.get("24h"), { status: "unavailable", reason: "provider-error" });
});
