import { useState } from "react";
import { AlertCircle, ArrowRight, LoaderCircle, LogOut } from "lucide-react";

import { beginFreshLogin, logout, type Me } from "../api";
import { restartAfterProviderLogout } from "../auth/providerLogout";
import { AuthShell } from "../components/system/AuthShell";

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
      await restartAfterProviderLogout(await beginFreshLogin());
    } catch {
      setIsRestartingLogin(false);
      setError("로그인을 다시 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <AuthShell
      title="승인 대기 중"
      description={
        <>
        <strong>{me.email}</strong> 계정으로 로그인하셨습니다. 관리자가 승인하면 여행 목록을 볼 수 있습니다.
        </>
      }
    >
      <div className="auth-actions">
        <button type="button" className="auth-action-primary" onClick={handleRestartLogin} disabled={isRestartingLogin}>
          {isRestartingLogin ? <LoaderCircle className="auth-spinner" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
          {isRestartingLogin ? "기존 세션을 종료하는 중" : "다른 계정으로 다시 로그인"}
        </button>
        <button type="button" className="auth-action-secondary" onClick={handleLogout} disabled={isRestartingLogin}>
          <LogOut aria-hidden="true" />
          로그아웃
        </button>
      </div>
      <p className="auth-supporting-copy">
        이 기기의 뭉치로그와 로그인 공급자 세션을 종료한 뒤 다시 인증합니다.
      </p>
      {isRestartingLogin && (
        <p className="auth-status" role="status" aria-live="polite">
          <LoaderCircle className="auth-spinner" aria-hidden="true" />
          인증 공급자의 기존 세션을 종료하고 있습니다.
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          <AlertCircle aria-hidden="true" />
          {error}
        </p>
      )}
    </AuthShell>
  );
}
