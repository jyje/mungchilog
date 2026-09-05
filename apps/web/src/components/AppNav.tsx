import { logout, type Me } from "../api";
import { ThemeToggleButton } from "./system/ThemeToggle";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "./ui/dropdown-menu";

// Systematic top nav for every "normal" (non-map) page: brand/home,
// admin link when applicable, and a user menu with logout. TripDayPage
// doesn't use this - its own floating map header (SplitMapShell) already
// carries the back/menu/share controls, and stacking a second full nav
// bar on top would fight the "map is the main event" goal there.
export function AppNav({ me, navigate }: { me: Me; navigate: (path: string) => void }) {
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
        <img src="/branding/mungchilog-paw.png" width="32" height="32" alt="" />
        <span>뭉치로그</span>
      </a>
      <div className="app-nav-spacer" />
      {me.role === "admin" && (
        <a className="app-nav-link" href="/admin" onClick={go("/admin")}>
          관리자
        </a>
      )}
      <ThemeToggleButton />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" size="icon-lg" className="app-nav-avatar" aria-label="사용자 메뉴">
            {initial}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{me.name ?? me.email}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => void handleLogout()}>로그아웃</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
