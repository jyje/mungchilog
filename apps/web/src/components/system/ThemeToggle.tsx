import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "../ui/button";
import { DropdownMenuItem } from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import "./theme-toggle.css";

type Theme = "light" | "dark";

const STORAGE_KEY = "mungchilog-theme";

function systemTheme(): Theme {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readInitialTheme(): { theme: Theme; explicit: boolean } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return { theme: stored, explicit: true };
  } catch {
    // A private browsing policy may block storage. The in-page toggle still works.
  }
  return { theme: systemTheme(), explicit: false };
}

function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Keep the selected theme for this page even when persistence is blocked.
  }
}

function applyTheme(theme: Theme, explicit: boolean) {
  const root = document.documentElement;
  if (explicit) root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
  root.classList.toggle("dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111214" : "#f5f6f8");
}

function useThemeToggle() {
  const [state, setState] = useState(readInitialTheme);

  useEffect(() => {
    applyTheme(state.theme, state.explicit);
  }, [state]);

  useEffect(() => {
    if (state.explicit || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = (event: MediaQueryListEvent) => setState({ theme: event.matches ? "dark" : "light", explicit: false });
    media.addEventListener?.("change", followSystem);
    return () => media.removeEventListener?.("change", followSystem);
  }, [state.explicit]);

  function toggle() {
    const theme = state.theme === "dark" ? "light" : "dark";
    storeTheme(theme);
    setState({ theme, explicit: true });
  }

  const target = state.theme === "dark" ? "라이트" : "다크";
  return { theme: state.theme, target, toggle };
}

/** A compact direct action for pages without an existing overflow menu. */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, target, toggle } = useThemeToggle();
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      className={cn("theme-toggle-trigger size-11 rounded-full", className)}
      aria-label={`${target} 테마로 전환`}
      title="테마 전환"
      onClick={toggle}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}

/** The same theme contract embedded in an existing More menu. */
export function ThemeToggleMenuItem() {
  const { theme, target, toggle } = useThemeToggle();
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <DropdownMenuItem onSelect={toggle} aria-label={`${target} 테마로 전환`}>
      <Icon aria-hidden="true" />
      <span>테마 전환</span>
      <span className="theme-toggle-state">현재 {theme === "dark" ? "다크" : "라이트"}</span>
    </DropdownMenuItem>
  );
}
