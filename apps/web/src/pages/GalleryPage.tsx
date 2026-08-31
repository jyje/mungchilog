import { useState } from "react";
import { Bell, CalendarDays, Clock3, Crosshair, MapPin, MapPinned, MoreVertical, Navigation, Plus, RotateCcw, Route, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MapIconButton } from "@/components/system/MapIconButton";
import { MapControlRail } from "@/components/system/MapControlRail";
import { ThemeToggleButton } from "@/components/system/ThemeToggle";
import { LocationSharingMapStatus } from "@/components/LocationSharingMapStatus";
import type { TripLocationSharingController } from "@/hooks/useTripLocationSharing";
import { GalleryRouteLegend } from "./gallery/GalleryRouteLegend";
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
  const [routeMode, setRouteMode] = useState("transit");
  const [scheduleKind, setScheduleKind] = useState("RESERVATION");

  return (
    <main className="component-gallery mx-auto min-h-dvh w-full max-w-6xl space-y-6 bg-background py-8 text-foreground">
      <header className="relative space-y-2 border-b pb-6">
        <ThemeToggleButton className="gallery-theme-toggle" />
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

      <GallerySection title="Planner foundation" description="Map discovery, place details, schedule meaning, and route choices share one compact interaction language.">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <ContextMenu>
            <ContextMenuTrigger className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-xl border bg-[linear-gradient(35deg,color-mix(in_oklab,var(--muted)_72%,transparent)_25%,transparent_25%,transparent_75%,color-mix(in_oklab,var(--muted)_72%,transparent)_75%),linear-gradient(35deg,color-mix(in_oklab,var(--muted)_72%,transparent)_25%,transparent_25%,transparent_75%,color-mix(in_oklab,var(--muted)_72%,transparent)_75%)] bg-[length:44px_44px] bg-[position:0_0,22px_22px]">
              <div className="space-y-3 text-center">
                <MapPinned className="mx-auto size-10 text-primary" aria-hidden="true" />
                <div>
                  <p className="font-medium">Map exploration surface</p>
                  <p className="text-sm text-muted-foreground">Right-click to preview the coordinate action</p>
                </div>
              </div>
              <Badge className="absolute bottom-3 left-3" variant="secondary">35.68124, 139.76712</Badge>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuLabel>Selected map point</ContextMenuLabel>
              <ContextMenuSeparator />
              <ContextMenuItem><MapPin /> Add a stop here</ContextMenuItem>
              <ContextMenuItem><Navigation /> Center the map here</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          <Tabs defaultValue="itinerary" className="min-w-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
              <TabsTrigger value="places">Places</TabsTrigger>
            </TabsList>
            <TabsContent value="itinerary" className="mt-4">
              <ScrollArea className="h-72 pr-3">
                <div className="space-y-3">
                  <article className="rounded-xl border bg-card p-4 text-card-foreground">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <Badge variant="outline"><Clock3 /> Reservation 10:00</Badge>
                        <h3 className="font-semibold">Tokyo Station</h3>
                        <p className="text-sm text-muted-foreground">Planned visit: 45 minutes</p>
                      </div>
                      <Badge>1</Badge>
                    </div>
                  </article>

                  <div className="space-y-3 rounded-xl border border-dashed p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">Route to the next stop</span>
                      <Badge variant="secondary">24 min</Badge>
                    </div>
                    <ToggleGroup type="single" value={routeMode} onValueChange={(value) => value && setRouteMode(value)} variant="outline" className="w-full">
                      <ToggleGroupItem value="walk" className="flex-1 text-foreground data-[state=on]:text-foreground">Walk</ToggleGroupItem>
                      <ToggleGroupItem value="transit" className="flex-1 text-foreground data-[state=on]:text-foreground">Transit</ToggleGroupItem>
                      <ToggleGroupItem value="drive" className="flex-1 text-foreground data-[state=on]:text-foreground">Drive</ToggleGroupItem>
                    </ToggleGroup>
                    <RadioGroup defaultValue="auto" className="grid gap-2 text-sm">
                      <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3">
                        <RadioGroupItem value="auto" /> Auto from stop schedule
                      </label>
                      <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3">
                        <RadioGroupItem value="depart" /> Depart at 10:45
                      </label>
                    </RadioGroup>
                    <RadioGroup defaultValue="route-1" className="grid gap-2 text-sm" aria-label="Route alternatives">
                      <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3">
                        <span className="flex items-center gap-3"><RadioGroupItem value="route-1" /> Recommended route</span>
                        <span className="text-muted-foreground">24 min · ¥210</span>
                      </label>
                      <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3">
                        <span className="flex items-center gap-3"><RadioGroupItem value="route-2" /> Fewer transfers</span>
                        <span className="text-muted-foreground">29 min · ¥180</span>
                      </label>
                    </RadioGroup>
                  </div>

                  <article className="rounded-xl border bg-card p-4 text-card-foreground">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <Badge variant="outline"><Clock3 /> Approx. 11:10</Badge>
                        <h3 className="font-semibold">Kitanomaru Park</h3>
                        <p className="text-sm text-muted-foreground">Arbitrary map coordinate</p>
                      </div>
                      <Badge variant="secondary">2</Badge>
                    </div>
                  </article>
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="places" className="mt-4 space-y-4 rounded-xl border p-4">
              <div className="space-y-1">
                <Badge variant="secondary">Museum</Badge>
                <h3 className="text-lg font-semibold">The National Museum of Modern Art</h3>
                <p className="text-sm text-muted-foreground">3-1 Kitanomaru Koen, Chiyoda City</p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">Open until 20:00</Badge>
                <Badge variant="outline">4.3 · 2,415 reviews</Badge>
              </div>
              <Button className="w-full"><Plus /> Add to itinerary</Button>
            </TabsContent>
          </Tabs>
        </div>

        <fieldset className="spot-schedule-editor mt-5">
          <legend>일정 시각 편집 예시</legend>
          <RadioGroup className="spot-time-kind" value={scheduleKind} onValueChange={setScheduleKind} aria-label="일정 시각 유형 예시">
            <label><RadioGroupItem value="NONE" /> 시간 미정</label>
            <label><RadioGroupItem value="APPROXIMATE" /> 대략적인 시각</label>
            <label><RadioGroupItem value="RESERVATION" /> 예약 시각</label>
          </RadioGroup>
          {scheduleKind !== "NONE" && (
            <div className="spot-schedule-fields">
              <label>
                <span>{scheduleKind === "RESERVATION" ? "예약 시각" : "예상 시각"}</span>
                <Input type="time" defaultValue="10:00" />
              </label>
              <label>
                <span>머무는 시간 (분, 선택)</span>
                <Input type="number" inputMode="numeric" min="0" step="15" defaultValue="45" />
              </label>
            </div>
          )}
        </fieldset>

        <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Planner loading, empty, and error states">
          <div className="space-y-3 rounded-xl border p-4" role="status" aria-label="Planner loading state">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="rounded-xl border border-dashed p-4 text-sm">
            <MapPin className="mb-3 size-5 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">No place selected</p>
            <p className="mt-1 text-muted-foreground">Choose a map place without changing the itinerary.</p>
          </div>
          <div className="rounded-xl border p-4 text-sm" role="alert">
            <p className="font-medium">Route unavailable</p>
            <p className="mt-1 text-muted-foreground">The saved mode remains selected while the map shows a temporary preview.</p>
            <Button className="mt-3" variant="outline" size="sm"><RotateCcw /> Retry</Button>
          </div>
        </div>
      </GallerySection>

      <GallerySection
        title="Route line styles"
        description="지도에 그리는 경로선 규칙입니다. 파랑은 탑승, 초록은 도보 구간이며, 흰 테두리가 강이나 공원 위에서도 선을 분리해 줍니다. 지도는 앱 테마를 따르지 않으므로 밝은 배경 위에서 확인합니다."
      >
        <GalleryRouteLegend />
      </GallerySection>

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
