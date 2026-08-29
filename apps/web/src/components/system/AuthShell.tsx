import { useLayoutEffect, type ReactNode } from "react";

import { ThemeToggle } from "../ThemeToggle";
import "./auth-shell.css";

type AuthShellProps = {
  title: string;
  description: ReactNode;
  children: ReactNode;
};

// Authentication pages need more room than the normal list-page column. This
// system wrapper owns that product layout contract and restores the normal
// application shell as soon as the route changes.
export function AuthShell({ title, description, children }: AuthShellProps) {
  useLayoutEffect(() => {
    const appRoot = document.getElementById("root");
    appRoot?.classList.add("auth-root");
    return () => appRoot?.classList.remove("auth-root");
  }, []);

  return (
    <main className="auth-shell">
      <section className="auth-shell-brand" aria-label="뭉치로그 소개">
        <div className="auth-shell-brand-mark">
          <img src="/pwa-192.png" width="64" height="64" alt="" />
          <span>뭉치로그</span>
        </div>
        <div className="auth-shell-brand-copy">
          <p className="auth-shell-brand-kicker">함께 만드는 여행 일정</p>
          <h2>여행의 흐름을 한곳에 모으세요.</h2>
          <p>장소와 일정, 이동 동선을 함께 정리하고 여행 중에도 같은 계획을 확인할 수 있습니다.</p>
        </div>
      </section>

      <section className="auth-shell-panel" aria-labelledby="auth-shell-title">
        <ThemeToggle />
        <div className="auth-shell-panel-inner">
          <div className="auth-shell-mobile-brand" aria-label="뭉치로그">
            <img src="/pwa-192.png" width="36" height="36" alt="" />
            <span>뭉치로그</span>
          </div>
          <header className="auth-shell-heading">
            <h1 id="auth-shell-title">{title}</h1>
            <div className="auth-shell-description">{description}</div>
          </header>
          {children}
        </div>
      </section>
    </main>
  );
}
