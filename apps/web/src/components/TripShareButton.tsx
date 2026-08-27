import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { listTripMembers, inviteToTrip, removeTripMember, type Me } from "../api";
import { LocationSharingControl, type SharedLocationWithName } from "./LocationSharingControl";

// The map header triggers an app-level sheet. Anyone on the trip can see
// who else is on it; only the owner (or a global admin) gets the invite
// form and remove buttons.
export function TripShareButton({
  tripId,
  me,
  sharedLocations,
  onLocationsChange,
  onFocusLocation,
}: {
  tripId: string;
  me: Me;
  sharedLocations: SharedLocationWithName[];
  onLocationsChange: (locations: SharedLocationWithName[]) => void;
  onFocusLocation: (userId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const qc = useQueryClient();
  const { data: members } = useQuery({
    queryKey: ["trip-members", tripId],
    queryFn: () => listTripMembers(tripId),
    enabled: open,
  });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function closeSheet() {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSheet();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;

      const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const invite = useMutation({
    mutationFn: () => inviteToTrip(tripId, email),
    onSuccess: () => {
      setEmail("");
      setError(null);
      setSuccess("초대했어요. 참여자 목록을 새로 고쳤습니다.");
      qc.invalidateQueries({ queryKey: ["trip-members", tripId] });
    },
    onError: (exception) => {
      setSuccess(null);
      setError((exception as Error).message);
    },
  });
  const remove = useMutation({
    mutationFn: (userId: string) => removeTripMember(tripId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip-members", tripId] }),
  });

  const myRole = members?.find((member) => member.id === me.id)?.role;
  const canManage = myRole === "owner" || me.role === "admin";
  const memberCount = members?.length ?? 0;

  return (
    <div className="menu-anchor">
      <button
        ref={triggerRef}
        type="button"
        className="menu-button"
        aria-label="같이 보는 사람"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        👥
      </button>
      {open && (
        <>
          <div className="share-sheet-backdrop" aria-hidden="true" onMouseDown={closeSheet} />
          <section
            ref={sheetRef}
            className="share-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <div className="share-sheet-handle" aria-hidden="true" />
            <header className="share-sheet-header">
              <div>
                <h2 id={titleId}>이 여행을 같이 보는 사람</h2>
                <p id={descriptionId} className="share-sheet-count">
                  참여 중 {memberCount}명
                </p>
              </div>
              <button ref={closeButtonRef} type="button" className="share-sheet-close" aria-label="닫기" onClick={closeSheet}>
                ×
              </button>
            </header>
            <ul className="share-member-list">
              {members?.map((member) => {
                const label = member.name ?? member.email;
                const initials = label.trim().slice(0, 2).toUpperCase();
                const shared = sharedLocations.find((location) => location.userId === member.id);
                return (
                  <li key={member.id} className="share-member-row">
                    <span className="share-member-avatar" aria-hidden="true">{initials}</span>
                    <span className="share-member-identity">
                      <span className="share-member-name">{label}</span>
                      <span className="share-member-role">{member.role === "owner" ? "여행 만든 사람" : "편집 가능"}</span>
                      {shared && (
                        <button
                          type="button"
                          className="shared-location-link"
                          onClick={() => onFocusLocation(shared.userId)}
                          aria-label={`${label} 위치 보기`}
                        >
                          위치 보기
                        </button>
                      )}
                    </span>
                    <span className="share-member-badge">{member.role === "owner" ? "소유자" : "편집자"}</span>
                    {canManage && member.role !== "owner" && (
                      <button
                        type="button"
                        className="item-delete share-member-remove"
                        aria-label={`${label} 제거`}
                        onClick={() => remove.mutate(member.id)}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                );
              })}
              {!members && <li className="share-members-status">참여자를 불러오는 중이에요.</li>}
              {members?.length === 0 && <li className="share-members-status">아직 참여자가 없어요.</li>}
            </ul>
            {canManage && (
              <form
                className="share-invite-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (email.trim()) invite.mutate();
                }}
              >
                <label htmlFor="trip-invite-email">이메일로 초대</label>
                <input
                  id="trip-invite-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="이메일 주소 입력"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError(null);
                    setSuccess(null);
                  }}
                />
                <button type="submit" disabled={!email.trim() || invite.isPending}>
                  {invite.isPending ? "초대하는 중..." : "이메일로 초대"}
                </button>
                <p className="share-invite-help">먼저 가입하고 관리자 승인이 완료된 사람을 초대할 수 있어요.</p>
              </form>
            )}
            {success && <p className="share-status" role="status">{success}</p>}
            {error && <p className="error share-status" role="alert">{error}</p>}
            <LocationSharingControl
              tripId={tripId}
              open={open}
              onLocationsChange={onLocationsChange}
              onFocus={onFocusLocation}
            />
          </section>
        </>
      )}
    </div>
  );
}
