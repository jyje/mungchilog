import { useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Compass,
  Crosshair,
  LoaderCircle,
  MapPinned,
  MapPin,
  Monitor,
  Navigation,
  Phone,
  Plus,
  Route,
  Share2,
  Tablet,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapIconButton } from "@/components/system/MapIconButton";
import { MapControlRail } from "@/components/system/MapControlRail";
import { cn } from "@/lib/utils";

type Viewport = "phone" | "tablet" | "desktop";
type Scene = "start" | "create" | "itinerary" | "collaboration" | "states";

const VIEWPORTS: { value: Viewport; label: string; icon: typeof Phone; className: string }[] = [
  { value: "phone", label: "휴대전화", icon: Phone, className: "max-w-[23.5rem]" },
  { value: "tablet", label: "태블릿", icon: Tablet, className: "max-w-2xl" },
  { value: "desktop", label: "데스크톱", icon: Monitor, className: "max-w-5xl" },
];

function StoryboardCanvas({ viewport, children }: { viewport: Viewport; children: React.ReactNode }) {
  const config = VIEWPORTS.find((item) => item.value === viewport) ?? VIEWPORTS[0];
  return (
    <div
      className={cn("mx-auto w-full overflow-hidden rounded-xl border bg-background shadow-sm", config.className)}
      data-storyboard-viewport={viewport}
    >
      {children}
    </div>
  );
}

function StoryboardMap() {
  return (
    <div className="map-container relative min-h-64 overflow-hidden border-y bg-[linear-gradient(30deg,#e8eef1_25%,transparent_25%,transparent_75%,#e8eef1_75%),linear-gradient(30deg,#e8eef1_25%,transparent_25%,transparent_75%,#e8eef1_75%)] bg-[size:40px_40px] bg-[position:0_0,20px_20px]" aria-label="선택된 일정의 지도 미리보기">
      <div className="absolute left-[22%] top-[28%] inline-flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm">1</div>
      <div className="absolute left-[56%] top-[58%] inline-flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground shadow-sm">2</div>
      <div className="absolute bottom-[27%] left-[31%] right-[34%] border-t-2 border-dashed border-primary/70" aria-hidden="true" />
      <div className="absolute right-3 top-3 flex flex-col gap-2" aria-label="지도 기본 컨트롤 예시">
        <Button variant="secondary" size="icon-lg" className="gm-control-active" aria-label="확대">+</Button>
        <Button variant="secondary" size="icon-lg" className="gm-svpc" aria-label="스트리트 뷰">−</Button>
        <Button variant="secondary" size="icon-lg" className="gm-style-mtc" aria-label="지도 유형"><MapPinned /></Button>
      </div>
      <div className="absolute bottom-2 right-2 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground gm-style-cc" aria-label="지도 저작권 영역">지도 데이터 · 약관</div>
      <MapControlRail>
        <MapIconButton icon={<Crosshair />} label="현재 위치" />
        <MapIconButton icon={<Route />} label="따라가기" selected />
      </MapControlRail>
    </div>
  );
}

function StoryboardHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <header className="flex items-center gap-3 border-b px-4 py-3">
      <Button variant="ghost" size="icon-lg" aria-label="이전 화면"><ArrowLeft /></Button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{title}</p>
        <p className="truncate text-sm text-muted-foreground">{detail}</p>
      </div>
      <Button variant="ghost" size="icon-lg" aria-label="참여자"><Users /></Button>
    </header>
  );
}

function StartScene({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="space-y-5 p-5" data-storyboard-scene="start">
      <div className="space-y-2">
        <Badge variant="secondary">여행 시작</Badge>
        <h3 className="text-xl font-semibold tracking-tight">아직 참여한 여행이 없습니다.</h3>
        <p className="text-sm text-muted-foreground">새 여행을 만들거나 받은 여행 파일을 불러올 수 있습니다.</p>
      </div>
      <div className="rounded-lg border border-dashed p-5 text-center">
        <Compass className="mx-auto mb-3 size-6 text-muted-foreground" />
        <p className="font-medium">첫 여행을 준비해보세요.</p>
        <p className="mt-1 text-sm text-muted-foreground">대표 장소와 날짜는 나중에 수정할 수 있습니다.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button onClick={onContinue}><Plus /> 새 여행 만들기</Button>
          <Button variant="outline">여행 파일 불러오기</Button>
        </div>
      </div>
    </div>
  );
}

function CreateScene({ onContinue }: { onContinue: () => void }) {
  return (
    <form className="space-y-4 p-5" data-storyboard-scene="create" onSubmit={(event) => { event.preventDefault(); onContinue(); }}>
      <div className="space-y-2">
        <Badge variant="secondary">여행 만들기</Badge>
        <h3 className="text-xl font-semibold tracking-tight">여행의 기본 정보를 입력합니다.</h3>
        <p className="text-sm text-muted-foreground">대표 장소를 선택하면 첫날 일정과 목적지 시간대를 함께 제안합니다.</p>
      </div>
      <label className="grid gap-2 text-sm font-medium">
        여행 이름
        <Input defaultValue="오사카 2박 3일" aria-label="여행 이름" />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        대표 장소
        <Input defaultValue="오사카성" aria-label="대표 장소" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-2 text-sm font-medium">
          시작일
          <Input type="date" defaultValue="2026-09-07" aria-label="시작일" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          종료일
          <Input type="date" defaultValue="2026-09-09" aria-label="종료일" />
        </label>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
        <span className="inline-flex items-center gap-2"><MapPin className="size-4 text-primary" /> 목적지 시간대</span>
        <Badge variant="outline">Asia/Tokyo</Badge>
      </div>
      <Button type="submit" className="w-full">첫날 일정 만들기 <ChevronRight /></Button>
    </form>
  );
}

function ItineraryScene() {
  return (
    <div data-storyboard-scene="itinerary">
      <StoryboardHeader title="오사카 2박 3일" detail="9월 7일 - 9월 9일 · Asia/Tokyo" />
      <StoryboardMap />
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">9월 7일 (월)</p>
            <p className="text-sm text-muted-foreground">대표 장소가 첫 일정으로 추가되었습니다.</p>
          </div>
          <Button variant="outline" size="sm"><CalendarDays /> 날짜</Button>
        </div>
        <ol className="space-y-2">
          <li>
            <Button variant="secondary" className="h-auto w-full justify-start gap-3 px-3 py-3 text-left" aria-current="true">
              <Badge>1</Badge>
              <span className="min-w-0 flex-1"><span className="block font-semibold">오사카성</span><span className="block text-sm text-muted-foreground">선택됨 · 지도와 일정이 함께 강조됩니다.</span></span>
              <Navigation className="size-4" />
            </Button>
          </li>
          <li>
            <Button variant="ghost" className="h-auto w-full justify-start gap-3 px-3 py-3 text-left">
              <Badge variant="outline">2</Badge>
              <span className="min-w-0 flex-1"><span className="block font-semibold">도톤보리</span><span className="block text-sm text-muted-foreground">오후 6:00 · 식사 예정</span></span>
              <ChevronRight className="size-4" />
            </Button>
          </li>
        </ol>
        <Button variant="outline" className="w-full"><Plus /> 장소 추가</Button>
      </div>
    </div>
  );
}

function CollaborationScene() {
  const [sharing, setSharing] = useState(false);
  return (
    <div className="space-y-4 p-5" data-storyboard-scene="collaboration">
      <div className="space-y-2">
        <Badge variant="secondary">함께 보기</Badge>
        <h3 className="text-xl font-semibold tracking-tight">초대와 위치 공유는 별도의 동의가 필요합니다.</h3>
        <p className="text-sm text-muted-foreground">여행 참여자에게만 보이며, 위치 공유는 언제든 끌 수 있습니다.</p>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><Users className="size-4" /></span>
          <div><p className="font-medium">같이 보는 사람</p><p className="text-sm text-muted-foreground">2명 참여 중</p></div>
        </div>
        <Sheet>
          <SheetTrigger asChild><Button variant="outline" size="sm">관리</Button></SheetTrigger>
          <SheetContent side="bottom" className="max-h-[80dvh]">
            <SheetHeader><SheetTitle>이 여행을 같이 보는 사람</SheetTitle><SheetDescription>초대 링크는 한 번만 사용할 수 있고, 역할은 여행 소유자가 정합니다.</SheetDescription></SheetHeader>
            <Button className="mt-6 w-full"><UserPlus /> 참여자 초대</Button>
          </SheetContent>
        </Sheet>
      </div>
      <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border p-3">
        <span><span className="block font-medium">내 위치 공유</span><span className="block text-sm text-muted-foreground">이 여행의 참여자에게만 임시로 공유</span></span>
        <Switch checked={sharing} onCheckedChange={setSharing} aria-label="내 위치 공유" />
      </label>
      {sharing && <p className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground"><Check className="size-4" /> 위치 공유가 켜졌습니다. 언제든 여기서 끌 수 있습니다.</p>}
      <Button variant="outline" className="w-full"><Share2 /> 따라가기 설정 보기</Button>
    </div>
  );
}

function StateScene() {
  return (
    <Tabs defaultValue="loading" className="space-y-4 p-5" data-storyboard-scene="states">
      <div className="space-y-2"><Badge variant="secondary">상태 점검</Badge><h3 className="text-xl font-semibold tracking-tight">성공 화면만 검토하지 않습니다.</h3></div>
      <TabsList className="h-auto flex-wrap"><TabsTrigger value="loading">불러오는 중</TabsTrigger><TabsTrigger value="empty">빈 일정</TabsTrigger><TabsTrigger value="error">복구 필요</TabsTrigger></TabsList>
      <TabsContent value="loading" className="rounded-lg border p-5 text-center"><LoaderCircle className="mx-auto mb-3 size-6 animate-spin text-primary" /><p className="font-medium">여행을 불러오는 중입니다.</p><p className="mt-1 text-sm text-muted-foreground">지도와 일정은 준비가 끝난 뒤 함께 표시됩니다.</p></TabsContent>
      <TabsContent value="empty" className="rounded-lg border border-dashed p-5 text-center"><CalendarDays className="mx-auto mb-3 size-6 text-muted-foreground" /><p className="font-medium">아직 이 날짜에 일정이 없습니다.</p><Button className="mt-4" variant="outline"><Plus /> 날짜 추가</Button></TabsContent>
      <TabsContent value="error" className="rounded-lg border border-destructive/30 p-5 text-center"><CircleAlert className="mx-auto mb-3 size-6 text-destructive" /><p className="font-medium">지도를 불러오지 못했습니다.</p><p className="mt-1 text-sm text-muted-foreground">일정은 계속 확인할 수 있습니다. 연결을 확인한 뒤 다시 시도하세요.</p><Button className="mt-4" variant="outline">다시 시도</Button></TabsContent>
    </Tabs>
  );
}

export function GalleryStoryboard() {
  const [viewport, setViewport] = useState<Viewport>("phone");
  const [scene, setScene] = useState<Scene>("start");

  return (
    <Tabs value={scene} onValueChange={(value) => setScene(value as Scene)} className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="start">여행 시작</TabsTrigger>
          <TabsTrigger value="create">여행 만들기</TabsTrigger>
          <TabsTrigger value="itinerary">일정 확인</TabsTrigger>
          <TabsTrigger value="collaboration">같이 보기</TabsTrigger>
          <TabsTrigger value="states">상태</TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap gap-1" role="group" aria-label="스토리보드 화면 크기">
          {VIEWPORTS.map((item) => {
            const Icon = item.icon;
            return <Button key={item.value} type="button" size="sm" variant={viewport === item.value ? "secondary" : "ghost"} aria-pressed={viewport === item.value} onClick={() => setViewport(item.value)}><Icon /> {item.label}</Button>;
          })}
        </div>
      </div>
      <TabsContent value="start"><StoryboardCanvas viewport={viewport}><StartScene onContinue={() => setScene("create")} /></StoryboardCanvas></TabsContent>
      <TabsContent value="create"><StoryboardCanvas viewport={viewport}><CreateScene onContinue={() => setScene("itinerary")} /></StoryboardCanvas></TabsContent>
      <TabsContent value="itinerary"><StoryboardCanvas viewport={viewport}><ItineraryScene /></StoryboardCanvas></TabsContent>
      <TabsContent value="collaboration"><StoryboardCanvas viewport={viewport}><CollaborationScene /></StoryboardCanvas></TabsContent>
      <TabsContent value="states"><StoryboardCanvas viewport={viewport}><StateScene /></StoryboardCanvas></TabsContent>
    </Tabs>
  );
}
