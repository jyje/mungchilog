import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { beginFreshLogin, logout, pingBackend } from "../src/api";
import { restartAfterProviderLogout } from "../src/auth/providerLogout";
import { Toaster } from "../src/components/ui/sonner";
import { LoginPage } from "../src/pages/LoginPage";
import { PendingPage } from "../src/pages/PendingPage";

vi.mock("../src/api", () => ({
  beginFreshLogin: vi.fn(),
  logout: vi.fn(),
  pingBackend: vi.fn(),
}));

vi.mock("../src/auth/providerLogout", () => ({
  restartAfterProviderLogout: vi.fn(),
}));

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
    clear: () => storage.clear(),
  });
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.mocked(beginFreshLogin).mockReset();
  vi.mocked(restartAfterProviderLogout).mockReset();
  vi.mocked(logout).mockReset();
  vi.mocked(pingBackend).mockReset().mockResolvedValue(undefined);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  // jsdom's window.location.assign isn't a configurable own property, so
  // vi.spyOn can't touch it directly - replace the whole location object.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: vi.fn() },
  });
});

describe("authentication pages", () => {
  it("makes the standard Authentik handoff the single primary action", async () => {
    render(<LoginPage />);

    const primary = screen.getByRole("button", { name: "Authentik으로 계속하기" });
    fireEvent.click(primary);

    expect(primary).toBeDisabled();
    expect(screen.getByRole("button", { name: "Authentik으로 이동 중" })).toBeInTheDocument();
    expect(screen.getByText("로그인하면 안전한 인증을 위해 Authentik으로 이동합니다.")).toBeInTheDocument();

    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/auth/login"));
  });

  it("keeps the user on the page and toasts a retry hint when the backend can't be reached", async () => {
    vi.mocked(pingBackend).mockRejectedValue(new Error("timeout"));
    render(
      <>
        <LoginPage />
        <Toaster />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Authentik으로 계속하기" }));

    expect(await screen.findByText("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.")).toBeInTheDocument();
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Authentik으로 계속하기" })).not.toBeDisabled();
  });

  it("describes and starts the separate fresh-account flow", async () => {
    vi.mocked(beginFreshLogin).mockResolvedValue("/auth/provider-logout");
    vi.mocked(restartAfterProviderLogout).mockResolvedValue();
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /다른 계정으로 로그인/ }));

    expect(await screen.findByRole("status")).toHaveTextContent("기존 인증 세션을 종료한 뒤 다른 계정으로 로그인하고 있습니다.");
    expect(beginFreshLogin).toHaveBeenCalledTimes(1);
    expect(restartAfterProviderLogout).toHaveBeenCalledWith("/auth/provider-logout");
  });

  it("uses the same accessible shell for an account awaiting approval", () => {
    render(<PendingPage me={{ id: "user-1", email: "pending@example.com", name: null, status: "pending", role: "member" }} />);

    expect(screen.getByRole("heading", { name: "승인 대기 중" })).toBeInTheDocument();
    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다른 계정으로 다시 로그인" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });
});
