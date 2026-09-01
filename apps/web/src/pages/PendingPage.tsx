import { useState } from "react";
import { ArrowRight, LoaderCircle, LogOut } from "lucide-react";
import { toast } from "sonner";

import { beginFreshLogin, logout, type Me } from "../api";
import { restartAfterProviderLogout } from "../auth/providerLogout";
import { AuthShell } from "../components/system/AuthShell";
import { Button } from "../components/ui/button";

export function PendingPage({ me }: { me: Me }) {
  const [isRestartingLogin, setIsRestartingLogin] = useState(false);

  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  async function handleRestartLogin() {
    setIsRestartingLogin(true);
    try {
      await restartAfterProviderLogout(await beginFreshLogin());
    } catch {
      setIsRestartingLogin(false);
      toast.error("로그인을 다시 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
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
        <Button type="button" className="auth-action-button min-h-12 w-full" onClick={handleRestartLogin} disabled={isRestartingLogin}>
          {isRestartingLogin ? <LoaderCircle className="auth-spinner" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
          {isRestartingLogin ? "기존 세션을 종료하는 중" : "다른 계정으로 다시 로그인"}
        </Button>
        <Button type="button" variant="outline" className="auth-action-button min-h-12 w-full" onClick={handleLogout} disabled={isRestartingLogin}>
          <LogOut aria-hidden="true" />
          로그아웃
        </Button>
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
    </AuthShell>
  );
}
