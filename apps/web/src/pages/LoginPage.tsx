import { useState } from "react";

import { beginFreshLogin } from "../api";

function LoginProgress() {
  return (
    <div className="login-progress" role="status" aria-live="polite">
      <div className="login-progress-track" aria-hidden="true">
        <span className="login-progress-cat">🐈</span>
      </div>
      <p>로그인 화면으로 이동하고 있습니다.</p>
    </div>
  );
}

export function LoginPage() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleLogin() {
    setError(null);
    setIsLoggingIn(true);
    window.setTimeout(() => window.location.assign("/auth/login"), 180);
  }

  async function handleFreshLogin() {
    setError(null);
    setIsLoggingIn(true);
    try {
      window.location.assign(await beginFreshLogin());
    } catch {
      setIsLoggingIn(false);
      setError("로그인을 다시 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <main className="page login-page">
      <h1>🐾 뭉치로그</h1>
      <p className="meta">여행 일정과 지도를 정리하는 개인 여행 앱입니다.</p>
      <div className="login-actions">
        <button type="button" className="login-button" onClick={handleLogin} disabled={isLoggingIn}>
          로그인
        </button>
        <button type="button" className="login-secondary" onClick={handleFreshLogin} disabled={isLoggingIn}>
          다른 계정으로 로그인
        </button>
      </div>
      {isLoggingIn && <LoginProgress />}
      {error && <p className="error login-error" role="alert">{error}</p>}
    </main>
  );
}
