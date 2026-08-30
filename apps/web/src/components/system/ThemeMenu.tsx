import { useEffect, useState } from "react";
import { Laptop, Menu, Moon, Sun } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import "./theme-menu.css";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "mungchilog-theme";

function readStored(): ThemePreference {
  try {
    const preference = localStorage.getItem(STORAGE_KEY);
    return preference === "light" || preference === "dark" ? preference : "system";
  } catch {
    return "system";
  }
}

function store(preference: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // The selected theme still applies for this page when storage is blocked.
  }
}

function apply(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);

  const systemDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = preference === "dark" || (preference === "system" && systemDark);
  root.classList.toggle("dark", isDark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? "#111214" : "#f5f6f8");
}

function themePreference(value: string): ThemePreference | null {
  return value === "system" || value === "light" || value === "dark" ? value : null;
}

/** Reusable navigation contract for changing the application theme. */
export function ThemeMenu({ className }: { className?: string }) {
  const [preference, setPreference] = useState<ThemePreference>(readStored);

  useEffect(() => {
    apply(preference);
    store(preference);
  }, [preference]);

  function changeTheme(value: string) {
    const next = themePreference(value);
    if (next) setPreference(next);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-lg" className={cn("theme-menu-trigger size-11 rounded-full", className)} aria-label="화면 테마 메뉴" title="화면 테마 메뉴">
          <Menu aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="theme-menu-content">
        <DropdownMenuLabel>화면 테마</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={preference} onValueChange={changeTheme}>
          <DropdownMenuRadioItem value="system"><Laptop aria-hidden="true" /> 시스템 설정</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light"><Sun aria-hidden="true" /> 라이트 테마</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon aria-hidden="true" /> 다크 테마</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
