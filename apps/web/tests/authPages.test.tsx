import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { beginFreshLogin, logout } from "../src/api";
import { restartAfterProviderLogout } from "../src/auth/providerLogout";
import { LoginPage } from "../src/pages/LoginPage";
import { PendingPage } from "../src/pages/PendingPage";

vi.mock("../src/api", () => ({
  beginFreshLogin: vi.fn(),
  logout: vi.fn(),
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
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
});

describe("authentication pages", () => {
  it("makes the standard Authentik handoff the single primary action", () => {
    render(<LoginPage />);

    const primary = screen.getByRole("button", { name: "Authentik으로 계속하기" });
    fireEvent.click(primary);

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(primary).toBeDisabled();
    expect(screen.getByRole("button", { name: "Authentik으로 이동 중" })).toBeInTheDocument();
    expect(screen.getByText("로그인하면 안전한 인증을 위해 Authentik으로 이동합니다.")).toBeInTheDocument();
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
