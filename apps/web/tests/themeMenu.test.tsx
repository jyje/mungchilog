import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggleButton } from "../src/components/system/ThemeToggle";

function setSystemTheme(isDark: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({ matches: isDark, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
}

describe("theme toggle", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
    setSystemTheme(false);
  });

  it("switches directly between light and dark without opening a menu", () => {
    render(<ThemeToggleButton />);
    const toggle = screen.getByRole("button", { name: "다크 테마로 전환" });
    expect(toggle).toHaveClass("theme-toggle-trigger");
    fireEvent.click(toggle);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("mungchilog-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "라이트 테마로 전환" })).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("falls back to the light palette when system theme detection is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(() => render(<ThemeToggleButton />)).not.toThrow();
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("keeps the toggle usable when theme storage is blocked", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new DOMException("blocked"); });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new DOMException("blocked"); });

    render(<ThemeToggleButton />);
    fireEvent.click(screen.getByRole("button", { name: "다크 테마로 전환" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("uses the system theme only as the unsaved initial value", () => {
    setSystemTheme(true);
    render(<ThemeToggleButton />);
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem("mungchilog-theme")).toBeNull();
  });
});
