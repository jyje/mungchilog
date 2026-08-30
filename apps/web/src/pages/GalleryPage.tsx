import { useEffect, useState } from "react";
import { Bell, CalendarDays, Crosshair, MapPinned, MoreVertical, Navigation, Plus, Route, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MapIconButton } from "@/components/system/MapIconButton";
import { MapControlRail } from "@/components/system/MapControlRail";
import { ThemeMenu } from "@/components/system/ThemeMenu";
import { LocationSharingMapStatus } from "@/components/LocationSharingMapStatus";
import type { TripLocationSharingController } from "@/hooks/useTripLocationSharing";
import { GalleryStoryboard } from "./gallery/GalleryStoryboard";

const galleryLocationSharing = {
  localActive: true,
  remoteActive: false,
  remoteOnOtherTrip: false,
  active: true,
  starting: false,
  interrupted: false,
  remaining: "42분 남음",
  pending: false,
  stopSharing: async () => undefined,
} as TripLocationSharingController;

function GallerySection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function GalleryPage() {
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const root = document.getElementById("root");
    root?.classList.add("gallery-root");
    return () => root?.classList.remove("gallery-root");
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 py-8">
      <header className="relative space-y-2 border-b pb-6">
        <ThemeMenu className="gallery-theme-menu" />
        <p className="text-sm font-medium text-primary">Development only</p>
        <h1 className="m-0 text-3xl">Component gallery</h1>
        <p className="max-w-2xl text-muted-foreground">Mungchilog uses shadcn primitives directly. Product wrappers are reserved for reusable interaction contracts, such as map controls.</p>
      </header>

      <GallerySection title="Actions" description="Standard variants, disabled state, menus, tooltips, and confirmation dialogs.">
        <div className="flex flex-wrap items-center gap-3">
          <Button>새 여행 만들기</Button>
          <Button variant="secondary">날짜 추가</Button>
          <Button variant="outline">초대하기</Button>
          <Button variant="ghost">취소</Button>
          <Button disabled>저장 중</Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-lg" aria-label="알림"><Bell /></Button>
            </TooltipTrigger>
            <TooltipContent>알림</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-lg" aria-label="여행 더보기"><MoreVertical /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>여행 설정</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>대표 장소 설정</DropdownMenuItem>
              <DropdownMenuItem>대표 사진 설정</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog>
            <DialogTrigger asChild><Button variant="destructive">여행 삭제</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>여행을 삭제할까요?</DialogTitle>
                <DialogDescription>삭제한 여행과 일정은 복구할 수 없습니다.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline">취소</Button>
                <Button variant="destructive">삭제</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </GallerySection>

      <div className="grid gap-6 lg:grid-cols-2">
        <GallerySection title="Itinerary controls" description="Tabs, a date popover, and location-sharing consent.">
          <Tabs defaultValue="read" className="space-y-4">
            <TabsList>
              <TabsTrigger value="read">읽기</TabsTrigger>
              <TabsTrigger value="edit">편집</TabsTrigger>
            </TabsList>
            <TabsContent value="read" className="rounded-lg border p-4 text-sm">마크다운 렌더링과 저장된 일정이 이 영역에 표시됩니다.</TabsContent>
            <TabsContent value="edit" className="rounded-lg border p-4 text-sm">저장하지 않은 변경은 이동 전에 확인합니다.</TabsContent>
          </Tabs>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Popover>
              <PopoverTrigger asChild><Button variant="outline"><CalendarDays /> 9월 7일 (일)</Button></PopoverTrigger>
              <PopoverContent className="w-72 space-y-3">
                <p className="font-medium">날짜 선택</p>
                <div className="grid grid-cols-7 gap-1 text-center text-sm text-muted-foreground">{[...Array(7)].map((_, index) => <span key={index}>{index + 7}</span>)}</div>
              </PopoverContent>
            </Popover>
            <label className="inline-flex min-h-11 items-center gap-3 text-sm">
              <Switch checked={sharing} onCheckedChange={setSharing} aria-label="내 위치 공유" />
              이 여행에서 내 위치 공유
            </label>
          </div>
        </GallerySection>

        <GallerySection title="Responsive panel" description="A native sheet is the baseline for narrow-screen actions.">
          <Sheet>
            <SheetTrigger asChild><Button variant="outline"><Users /> 같이 보는 사람</Button></SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80dvh]">
              <SheetHeader>
                <SheetTitle>이 여행을 같이 보는 사람</SheetTitle>
                <SheetDescription>초대와 위치 공유는 참여자 동의와 권한에 따라 동작합니다.</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-3">
                <Button className="w-full"><Plus /> 참여자 초대</Button>
                <Button className="w-full" variant="outline">공유 설정</Button>
              </div>
            </SheetContent>
          </Sheet>
        </GallerySection>
      </div>

      <GallerySection title="UI storyboard" description="Review the full travel flow in live component compositions before changing a production screen. Each scene uses deterministic sample content only.">
        <GalleryStoryboard />
      </GallerySection>

      <GallerySection title="Map control composition" description="The gray controls simulate Google Maps-owned UI. App controls measure that area and move as a single non-overlapping rail.">
        <div className="map-container relative min-h-96 overflow-hidden rounded-xl border bg-[linear-gradient(30deg,#e8eef1_25%,transparent_25%,transparent_75%,#e8eef1_75%),linear-gradient(30deg,#e8eef1_25%,transparent_25%,transparent_75%,#e8eef1_75%)] bg-[size:40px_40px] bg-[position:0_0,20px_20px]">
          <div className="absolute left-4 top-4 rounded-lg bg-background/95 p-3 text-sm shadow-sm">
            <p className="font-medium">안양 1일</p>
            <p className="text-muted-foreground">8월 29일 (토)</p>
          </div>
          <div className="absolute right-4 top-4 flex flex-col gap-2" aria-label="Google Maps controls mock">
            <Button variant="secondary" size="icon-lg" className="gm-control-active" aria-label="확대">+</Button>
            <Button variant="secondary" size="icon-lg" className="gm-svpc" aria-label="스트리트 뷰">−</Button>
            <Button variant="secondary" size="icon-lg" className="gm-style-mtc" aria-label="지도 유형"><MapPinned /></Button>
          </div>
          <div className="absolute bottom-2 right-2 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground gm-style-cc" aria-label="Google 지도 저작권 영역">지도 데이터 ©2026 · 약관</div>
          <MapControlRail className="gallery-map-control-rail">
            <MapIconButton icon={<Crosshair />} label="현재 위치" />
            <MapIconButton icon={<Route />} label="따라가기" selected />
            <LocationSharingMapStatus controller={galleryLocationSharing} onOpenDetails={() => undefined} />
            <MapIconButton icon={<Navigation />} label="선택한 장소로 이동" />
          </MapControlRail>
        </div>
      </GallerySection>
    </main>
  );
}
