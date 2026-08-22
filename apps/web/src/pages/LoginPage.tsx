// Just a link to the server's own /auth/login (a real page navigation,
// not an SPA route) - that route redirects to the OIDC provider, and
// its own login screen (Google button + local username/password, if the
// provider offers both - see docs/authentik-setup.md) takes it from there.
export function LoginPage() {
  return (
    <div className="page login-page">
      <h1>🐾 뭉치로그</h1>
      <p className="meta">여행 일정과 지도를 정리하는 개인 여행 앱입니다.</p>
      <a className="login-button" href="/auth/login">
        로그인
      </a>
    </div>
  );
}
