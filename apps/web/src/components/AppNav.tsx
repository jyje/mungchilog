import { useState } from "react";
import { logout, type Me } from "../api";
import { ThemeToggleButton } from "./system/ThemeToggle";

// Systematic top nav for every "normal" (non-map) page: brand/home,
// admin link when applicable, and a user menu with logout. TripDayPage
// doesn't use this - its own floating map header (SplitMapShell) already
// carries the back/menu/share controls, and stacking a second full nav
// bar on top would fight the "map is the main event" goal there.
export function AppNav({ me, navigate }: { me: Me; navigate: (path: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  function go(path: string) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      navigate(path);
    };
  }

  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  const initial = (me.name ?? me.email).trim()[0]?.toUpperCase() ?? "?";

  return (
    <nav className="app-nav">
      <a className="app-nav-brand" href="/trips" onClick={go("/trips")}>
        🐾 뭉치로그
      </a>
      <div className="app-nav-spacer" />
      {me.role === "admin" && (
        <a className="app-nav-link" href="/admin" onClick={go("/admin")}>
          관리자
        </a>
      )}
      <ThemeToggleButton />
      <div className="menu-anchor">
        <button type="button" className="app-nav-avatar" aria-label="사용자 메뉴" onClick={() => setMenuOpen((o) => !o)}>
          {initial}
        </button>
        {menuOpen && (
          <>
            <button type="button" className="menu-backdrop" aria-label="닫기" onClick={() => setMenuOpen(false)} />
            <div className="layout-menu layout-menu-right" role="menu">
              <p className="app-nav-menu-identity">{me.name ?? me.email}</p>
              <button type="button" onClick={handleLogout}>
                로그아웃
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
