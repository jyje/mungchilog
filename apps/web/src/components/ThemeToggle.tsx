import { useEffect, useState } from "react";

type ThemePref = "system" | "light" | "dark";

const STORAGE_KEY = "mungchilog-theme";
const ORDER: ThemePref[] = ["system", "light", "dark"];
const ICON: Record<ThemePref, string> = { system: "🌓", light: "☀️", dark: "🌙" };
const LABEL: Record<ThemePref, string> = { system: "시스템 테마", light: "라이트 테마", dark: "다크 테마" };

function readStored(): ThemePref {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

// Mirrors the inline boot script in index.html so a manual toggle updates
// both the CSS variable set (via [data-theme]) and the PWA's browser-chrome
// color (the theme-color meta tag) without a reload.
function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);

  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#111214" : "#f5f6f8");
}

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(readStored);

  useEffect(() => {
    apply(pref);
    localStorage.setItem(STORAGE_KEY, pref);
  }, [pref]);

  function cycle() {
    setPref((p) => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length]);
  }

  return (
    <button type="button" className="theme-toggle" onClick={cycle} aria-label={`테마 전환 (현재: ${LABEL[pref]})`}>
      {ICON[pref]}
    </button>
  );
}
