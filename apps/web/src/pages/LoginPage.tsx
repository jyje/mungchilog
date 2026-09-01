import { useState } from "react";
import { ArrowRight, LoaderCircle, LogIn } from "lucide-react";
import { toast } from "sonner";

import { beginFreshLogin, pingBackend } from "../api";
import { restartAfterProviderLogout } from "../auth/providerLogout";
import { AuthShell } from "../components/system/AuthShell";
import { Button } from "../components/ui/button";

export function LoginPage() {
  const [loginState, setLoginState] = useState<"idle" | "standard" | "fresh">("idle");
  const isLoggingIn = loginState !== "idle";

  // A bare `window.location.assign` hands control to the browser's own page
  // navigation, which has no timeout - if the backend is down, the tab just
  // sits on this half-navigated page with the spinner frozen forever, with
  // no way for this component to recover. Confirming the backend answers
  // first keeps the failure inside React state, where it can show an error
  // and let the user retry instead of leaving them staring at a spinner.
  //
  // The failure itself surfaces as a toast, not inline copy: an inline error
  // block pushes the layout down right as the user is about to retry, which
  // reads as the page itself breaking. A toast says the same thing without
  // moving anything else on the page.
  async function handleLogin() {
    setLoginState("standard");
    try {
      await pingBackend();
      window.location.assign("/auth/login");
    } catch {
      setLoginState("idle");
      toast.error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  async function handleFreshLogin() {
    setLoginState("fresh");
    try {
      await restartAfterProviderLogout(await beginFreshLogin());
    } catch {
      setLoginState("idle");
      toast.error("로그인을 다시 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <AuthShell
      title="여행을 함께 계획하세요."
      description={<>뭉치로그에서 일정과 장소, 이동 동선을 한 화면으로 정리할 수 있습니다.</>}
    >
      <div className="auth-actions">
        <Button type="button" className="auth-action-button min-h-12 w-full" onClick={handleLogin} disabled={isLoggingIn}>
          {loginState === "standard" ? <LoaderCircle className="auth-spinner" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
          {loginState === "standard" ? "Authentik으로 이동 중" : "Authentik으로 계속하기"}
        </Button>
        <p className="auth-provider-note">로그인하면 안전한 인증을 위해 Authentik으로 이동합니다.</p>
        <Button type="button" variant="link" className="auth-text-button" onClick={handleFreshLogin} disabled={isLoggingIn}>
          다른 계정으로 로그인 <ArrowRight aria-hidden="true" />
        </Button>
      </div>
      {loginState === "fresh" && (
        <p className="auth-status" role="status" aria-live="polite">
          <LoaderCircle className="auth-spinner" aria-hidden="true" />
          기존 인증 세션을 종료한 뒤 다른 계정으로 로그인하고 있습니다.
        </p>
      )}
    </AuthShell>
  );
}
