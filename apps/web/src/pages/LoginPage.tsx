import { useState } from "react";
import { AlertCircle, ArrowRight, LoaderCircle, LogIn } from "lucide-react";

import { beginFreshLogin } from "../api";
import { restartAfterProviderLogout } from "../auth/providerLogout";
import { AuthShell } from "../components/system/AuthShell";

export function LoginPage() {
  const [loginState, setLoginState] = useState<"idle" | "standard" | "fresh">("idle");
  const [error, setError] = useState<string | null>(null);
  const isLoggingIn = loginState !== "idle";

  function handleLogin() {
    setError(null);
    setLoginState("standard");
    window.requestAnimationFrame(() => window.location.assign("/auth/login"));
  }

  async function handleFreshLogin() {
    setError(null);
    setLoginState("fresh");
    try {
      await restartAfterProviderLogout(await beginFreshLogin());
    } catch {
      setLoginState("idle");
      setError("로그인을 다시 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <AuthShell
      title="여행을 함께 계획하세요."
      description={<>뭉치로그에서 일정과 장소, 이동 동선을 한 화면으로 정리할 수 있습니다.</>}
    >
      <div className="auth-actions">
        <button type="button" className="auth-action-primary" onClick={handleLogin} disabled={isLoggingIn}>
          {loginState === "standard" ? <LoaderCircle className="auth-spinner" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
          {loginState === "standard" ? "Authentik으로 이동 중" : "Authentik으로 계속하기"}
        </button>
        <p className="auth-provider-note">로그인하면 안전한 인증을 위해 Authentik으로 이동합니다.</p>
        <button type="button" className="auth-text-button" onClick={handleFreshLogin} disabled={isLoggingIn}>
          다른 계정으로 로그인 <ArrowRight aria-hidden="true" />
        </button>
      </div>
      {loginState === "fresh" && (
        <p className="auth-status" role="status" aria-live="polite">
          <LoaderCircle className="auth-spinner" aria-hidden="true" />
          기존 인증 세션을 종료한 뒤 다른 계정으로 로그인하고 있습니다.
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
