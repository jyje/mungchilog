import { useState } from "react";

import { beginFreshLogin, logout, type Me } from "../api";

export function PendingPage({ me }: { me: Me }) {
  const [isRestartingLogin, setIsRestartingLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  async function handleRestartLogin() {
    setError(null);
    setIsRestartingLogin(true);
    try {
      window.location.assign(await beginFreshLogin());
    } catch {
      setIsRestartingLogin(false);
      setError("로그인을 다시 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <div className="page">
      <h1>승인 대기 중</h1>
      <p className="meta">
        <strong>{me.email}</strong> 계정으로 로그인하셨습니다. 관리자가 승인하면 여행 목록을 볼 수 있습니다.
      </p>
      <div className="account-actions">
        <button type="button" className="login-button" onClick={handleRestartLogin} disabled={isRestartingLogin}>
          {isRestartingLogin ? "기존 세션을 종료하는 중" : "다른 계정으로 다시 로그인"}
        </button>
        <button type="button" className="ghost" onClick={handleLogout} disabled={isRestartingLogin}>
          로그아웃
        </button>
      </div>
      <p className="meta account-actions-help">
        이 기기의 뭉치로그와 로그인 공급자 세션을 종료한 뒤 다시 인증합니다.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
