import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { adminListUsers, adminApproveUser, adminRejectUser } from "../api";

export function AdminPage() {
  const qc = useQueryClient();
  const { data: users, error } = useQuery({ queryKey: ["admin", "users"], queryFn: adminListUsers });

  const approve = useMutation({
    mutationFn: adminApproveUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  const reject = useMutation({
    mutationFn: adminRejectUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  if (error) return <p className="error">{String((error as Error).message ?? error)}</p>;
  if (!users) return <p className="meta">불러오는 중...</p>;

  const pending = users.filter((u) => u.status === "pending");
  const approved = users.filter((u) => u.status === "approved");

  return (
    <div className="page">
      <h1>관리자</h1>

      <h2>승인 대기 ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="empty">대기 중인 사용자가 없습니다.</p>
      ) : (
        <ul>
          {pending.map((u) => (
            <li key={u.id} className="admin-user-row">
              <span className="admin-user-identity">
                {u.name ?? u.email}
                <span className="meta">{u.email}</span>
              </span>
              <div className="admin-user-actions">
                <button type="button" onClick={() => approve.mutate(u.id)} disabled={approve.isPending}>
                  승인
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    if (confirm(`${u.email}의 가입 요청을 거절할까요?`)) reject.mutate(u.id);
                  }}
                >
                  거절
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2>승인됨 ({approved.length})</h2>
      <ul>
        {approved.map((u) => (
          <li key={u.id} className="admin-user-row">
            <span className="admin-user-identity">
              {u.name ?? u.email}
              <span className="meta">
                {u.email}
                {u.role === "admin" ? " · 관리자" : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="meta">여행을 특정 사용자와 같이 보려면, 그 여행 화면의 👥 버튼으로 초대하세요.</p>
    </div>
  );
}
