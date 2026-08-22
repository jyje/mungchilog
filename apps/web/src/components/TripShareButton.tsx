import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { listTripMembers, inviteToTrip, removeTripMember, type Me } from "../api";

// Floating share icon in the map header, mirroring the layout menu's own
// popover pattern (menu-anchor/menu-backdrop). Anyone on the trip can see
// who else is on it; only the owner (or a global admin) gets the invite
// form and remove buttons.
export function TripShareButton({ tripId, me }: { tripId: string; me: Me }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: members } = useQuery({
    queryKey: ["trip-members", tripId],
    queryFn: () => listTripMembers(tripId),
    enabled: open,
  });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () => inviteToTrip(tripId, email),
    onSuccess: () => {
      setEmail("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["trip-members", tripId] });
    },
    onError: (e) => setError((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => removeTripMember(tripId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip-members", tripId] }),
  });

  const myRole = members?.find((m) => m.id === me.id)?.role;
  const canManage = myRole === "owner" || me.role === "admin";

  return (
    <div className="menu-anchor">
      <button type="button" className="menu-button" aria-label="같이 보는 사람" onClick={() => setOpen((o) => !o)}>
        👥
      </button>
      {open && (
        <>
          <button type="button" className="menu-backdrop" aria-label="닫기" onClick={() => setOpen(false)} />
          <div className="layout-menu share-panel" role="dialog">
            <p className="field-label">이 여행을 같이 보는 사람</p>
            <ul className="share-member-list">
              {members?.map((m) => (
                <li key={m.id}>
                  <span>
                    {m.name ?? m.email} <span className="meta">{m.role === "owner" ? "소유자" : "편집자"}</span>
                  </span>
                  {canManage && m.role !== "owner" && (
                    <button type="button" className="item-delete" aria-label="제거" onClick={() => remove.mutate(m.id)}>
                      ✕
                    </button>
                  )}
                </li>
              ))}
              {members?.length === 0 && <li className="meta">아직 소유자만 있습니다.</li>}
            </ul>
            {canManage && (
              <div className="share-invite-row">
                <input
                  type="email"
                  placeholder="이메일로 초대 (승인된 사용자만)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => email.trim() && invite.mutate()}
                  disabled={!email.trim() || invite.isPending}
                >
                  초대
                </button>
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
