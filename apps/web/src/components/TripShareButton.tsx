import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { Users, X } from "lucide-react";
import { listTripMembers, inviteToTrip, removeTripMember, type Me } from "../api";
import { type SharedLocationWithName, type TripLocationSharingController } from "../hooks/useTripLocationSharing";
import { LocationSharingControl } from "./LocationSharingControl";
import { Input } from "./ui/input";

// The map header triggers an app-level sheet. Anyone on the trip can see
// who else is on it; only the owner (or a global admin) gets the invite
// form and remove buttons.
export function TripShareButton({
  tripId,
  me,
  open,
  onOpenChange,
  locationSharing,
  sharedLocations,
  onFocusLocation,
}: {
  tripId: string;
  me: Me;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationSharing: TripLocationSharingController;
  sharedLocations: SharedLocationWithName[];
  onFocusLocation: (userId: string | null) => void;
}) {
  const qc = useQueryClient();
  const { data: members } = useQuery({
    queryKey: ["trip-members", tripId],
    queryFn: () => listTripMembers(tripId),
    enabled: open,
  });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" variant="secondary" size="icon-lg" className="menu-button" aria-label="같이 보는 사람" title="같이 보는 사람" aria-haspopup="dialog" aria-expanded={open} data-sharing-active={locationSharing.localActive || locationSharing.remoteActive || undefined}>
          <Users aria-hidden="true" />
          {(locationSharing.localActive || locationSharing.remoteActive) && <span className="share-live-indicator" aria-hidden="true" />}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" showCloseButton={false} className="share-sheet">
        <div className="share-sheet-handle" aria-hidden="true" />
        <SheetHeader className="share-sheet-header">
          <div>
            <SheetTitle>이 여행을 같이 보는 사람</SheetTitle>
            <SheetDescription className="share-sheet-count">참여 중 {memberCount}명</SheetDescription>
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon-lg" className="share-sheet-close" aria-label="닫기">
              <X aria-hidden="true" />
            </Button>
          </SheetClose>
        </SheetHeader>
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
                    <Button
                      type="button"
                      variant="ghost"
                      className="shared-location-link"
                      onClick={() => onFocusLocation(shared.userId)}
                      aria-label={`${label} 위치 보기`}
                    >
                      위치 보기
                    </Button>
                  )}
                </span>
                <span className="share-member-badge">{member.role === "owner" ? "소유자" : "편집자"}</span>
                {canManage && member.role !== "owner" && (
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    type="button"
                    className="share-member-remove"
                    aria-label={`${label} 제거`}
                    onClick={() => remove.mutate(member.id)}
                  >
                    <X aria-hidden="true" />
                  </Button>
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
            <Input
              className="min-h-11"
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
            <Button type="submit" disabled={!email.trim() || invite.isPending}>
              {invite.isPending ? "초대하는 중..." : "이메일로 초대"}
            </Button>
            <p className="share-invite-help">먼저 가입하고 관리자 승인이 완료된 사람을 초대할 수 있어요.</p>
          </form>
        )}
        {success && <p className="share-status" role="status">{success}</p>}
        {error && <p className="error share-status" role="alert">{error}</p>}
        <LocationSharingControl controller={locationSharing} />
      </SheetContent>
    </Sheet>
  );
}
