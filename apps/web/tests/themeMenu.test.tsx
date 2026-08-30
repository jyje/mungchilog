import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeMenu } from "../src/components/system/ThemeMenu";

function setSystemTheme(isDark: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({ matches: isDark, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
}

describe("theme menu", () => {
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

  it("uses a hamburger menu to select system, light, or dark without a floating theme button", async () => {
    render(<ThemeMenu />);
    expect(screen.getByRole("button", { name: "화면 테마 메뉴" })).toHaveClass("theme-menu-trigger");
    fireEvent.pointerDown(screen.getByRole("button", { name: "화면 테마 메뉴" }), { button: 0 });

    expect(await screen.findByRole("menuitemradio", { name: "시스템 설정" })).toHaveAttribute("data-state", "checked");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "다크 테마" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("mungchilog-theme")).toBe("dark");
  });

  it("falls back to the light palette when system theme detection is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(() => render(<ThemeMenu />)).not.toThrow();
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("keeps the menu usable when theme storage is blocked", async () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new DOMException("blocked"); });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new DOMException("blocked"); });

    render(<ThemeMenu />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "화면 테마 메뉴" }), { button: 0 });
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "다크 테마" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveClass("dark");
  });
});
