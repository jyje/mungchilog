import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminGetUsage, adminListUsers, type AdminUsage } from "../src/api";
import { AdminPage } from "../src/pages/AdminPage";

vi.mock("../src/api", () => ({
  adminListUsers: vi.fn(),
  adminApproveUser: vi.fn(),
  adminRejectUser: vi.fn(),
  adminGetUsage: vi.fn(),
}));

const application = {
  users: { pending: 1, approved: 3 },
  trips: 5,
  memberships: 8,
  routeCache: { entries: 11, freshEntries: 9 },
  placeCache: { entries: 7, freshEntries: 6 },
};

function usage(google: AdminUsage["google"]): AdminUsage {
  return { window: "24h", generatedAt: "2026-08-31T00:05:00.000Z", application, google };
}

function renderAdmin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><AdminPage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(adminListUsers).mockReset().mockResolvedValue([
    { id: "pending", email: "pending@example.test", name: null, status: "pending", role: "member" },
    { id: "admin", email: "admin@example.test", name: "Admin", status: "approved", role: "admin" },
  ]);
  vi.mocked(adminGetUsage).mockReset().mockResolvedValue(usage({ status: "disabled", reason: "not-configured" }));
});

describe("administrator usage", () => {
  it("preserves user approval as the default independent view", async () => {
    renderAdmin();
    expect(await screen.findByRole("heading", { name: "승인 대기 (1)" })).toBeInTheDocument();
    expect(screen.getByText("pending@example.test")).toBeInTheDocument();
    expect(adminGetUsage).not.toHaveBeenCalled();
  });

  it("loads aggregate usage only after the usage tab is selected", async () => {
    const user = userEvent.setup();
    renderAdmin();
    await user.click(screen.getByRole("tab", { name: "사용량" }));

    expect(await screen.findByRole("heading", { name: "애플리케이션" })).toBeInTheDocument();
    expect(screen.getByText("승인 대기 1명")).toBeInTheDocument();
    expect(screen.getByText("9 / 11")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Google API 사용량" })).toBeInTheDocument();
    expect(adminGetUsage).toHaveBeenCalledWith("24h");

    await user.click(screen.getByRole("button", { name: "7일" }));
    expect(await screen.findByRole("button", { name: "7일", pressed: true })).toBeInTheDocument();
    expect(adminGetUsage).toHaveBeenCalledWith("7d");
  });

  it("summarizes authoritative Google metrics without relying on the chart color", async () => {
    vi.mocked(adminGetUsage).mockResolvedValue(usage({
      status: "available",
      sampledUntil: "2026-08-31T00:00:00.000Z",
      services: [{
        service: "routes.googleapis.com",
        label: "Routes API",
        requests: 12,
        errors: 2,
        errorRate: 1 / 6,
        latencyMs: { p50: 125, p95: 1_200 },
        quota: null,
        trend: [
          { at: "2026-08-30T23:00:00.000Z", requests: 4, errors: 0 },
          { at: "2026-08-31T00:00:00.000Z", requests: 8, errors: 2 },
        ],
      }],
    }));
    const user = userEvent.setup();
    renderAdmin();
    await user.click(screen.getByRole("tab", { name: "사용량" }));

    expect(await screen.findByRole("heading", { name: "Routes API" })).toBeInTheDocument();
    expect(screen.getByText("2건 · 16.7%")).toBeInTheDocument();
    expect(screen.getByText("p50 125ms · p95 1.2초")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Routes API: 2개 구간에서 요청 12건, 최대 구간 8건/ })).toBeInTheDocument();
  });

  it("keeps application metrics visible when Google monitoring fails", async () => {
    vi.mocked(adminGetUsage).mockResolvedValue(usage({ status: "unavailable", reason: "provider-error" }));
    const user = userEvent.setup();
    renderAdmin();
    await user.click(screen.getByRole("tab", { name: "사용량" }));

    expect(await screen.findByRole("heading", { name: "Google API 사용량을 불러오지 못했습니다" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "애플리케이션" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(adminGetUsage).toHaveBeenCalledTimes(2);
    expect(adminGetUsage).toHaveBeenLastCalledWith("24h", true);
  });

  it("shows a clear empty state when monitoring has no request series", async () => {
    vi.mocked(adminGetUsage).mockResolvedValue(usage({
      status: "available",
      sampledUntil: new Date().toISOString(),
      services: [],
    }));
    const user = userEvent.setup();
    renderAdmin();
    await user.click(screen.getByRole("tab", { name: "사용량" }));

    expect(await screen.findByRole("heading", { name: "선택한 기간에 수집된 요청이 없습니다" })).toBeInTheDocument();
  });
});
