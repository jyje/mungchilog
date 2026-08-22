import { logout, type Me } from "../api";

export function PendingPage({ me }: { me: Me }) {
  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  return (
    <div className="page">
      <h1>승인 대기 중</h1>
      <p className="meta">
        <strong>{me.email}</strong> 계정으로 로그인하셨습니다. 관리자가 승인하면 여행 목록을 볼 수 있습니다.
      </p>
      <button type="button" className="ghost" onClick={handleLogout}>
        로그아웃
      </button>
    </div>
  );
}
