import { useState } from "react";
import { Bell, LoaderCircle, MoreVertical, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DateAddSplitButton } from "@/components/system/DateAddSplitButton";
import { PlannerChoiceGroup, PlannerChoiceItem } from "@/components/system/PlannerChoiceGroup";

const TOKENS = [
  { label: "Canvas", className: "bg-background text-foreground" },
  { label: "Card", className: "bg-card text-card-foreground" },
  { label: "Primary", className: "bg-primary text-primary-foreground" },
  { label: "Secondary", className: "bg-secondary text-secondary-foreground" },
  { label: "Muted", className: "bg-muted text-muted-foreground" },
  { label: "Destructive", className: "bg-destructive/15 text-destructive" },
] as const;

export function ProductThemeGallery() {
  const [date, setDate] = useState("2026-09-07");
  const [mode, setMode] = useState("TRANSIT");
  const [checked, setChecked] = useState(true);
  const [sharing, setSharing] = useState(false);

  return (
    <div className="space-y-7" data-ui-theme-contract>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Semantic theme tokens">
        {TOKENS.map((token) => (
          <div key={token.label} className={`rounded-lg border p-3 text-sm font-medium ${token.className}`}>
            {token.label}
          </div>
        ))}
      </div>

      <section className="space-y-3" aria-labelledby="theme-actions">
        <div>
          <h3 id="theme-actions" className="font-semibold">Actions</h3>
          <p className="text-sm text-muted-foreground">One primary action per region, outline for regular actions, ghost for quiet actions, and destructive only for irreversible work.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button><Plus data-icon="inline-start" /> 새 여행 만들기</Button>
          <Button variant="outline">초대하기</Button>
          <Button variant="secondary">현재 선택</Button>
          <Button variant="ghost">취소</Button>
          <Button variant="destructive"><Trash2 data-icon="inline-start" /> 삭제</Button>
          <Button disabled><LoaderCircle className="animate-spin" data-icon="inline-start" /> 저장 중</Button>
          <Tooltip>
            <TooltipTrigger asChild><Button variant="outline" size="icon-lg" aria-label="알림"><Bell /></Button></TooltipTrigger>
            <TooltipContent>알림</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="icon-lg" aria-label="더보기"><MoreVertical /></Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>여행 설정</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>대표 장소 설정</DropdownMenuItem>
              <DropdownMenuItem>대표 사진 설정</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog>
            <DialogTrigger asChild><Button variant="destructive">삭제 확인</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>여행을 삭제할까요?</DialogTitle><DialogDescription>삭제한 여행과 일정은 복구할 수 없습니다.</DialogDescription></DialogHeader>
              <DialogFooter><DialogClose asChild><Button variant="outline">취소</Button></DialogClose><Button variant="destructive">삭제</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="theme-planner-choices">
        <div>
          <h3 id="theme-planner-choices" className="font-semibold">Planner choices and grouped actions</h3>
          <p className="text-sm text-muted-foreground">Dates and travel modes share one single-choice contract. Date creation remains an action group.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PlannerChoiceGroup value={date} onValueChange={(next) => next && setDate(next)} aria-label="갤러리 여행 날짜">
            <PlannerChoiceItem value="2026-09-07">9월 7일 (월)</PlannerChoiceItem>
            <PlannerChoiceItem value="2026-09-08">9월 8일 (화)</PlannerChoiceItem>
          </PlannerChoiceGroup>
          <DateAddSplitButton onAddDay={() => undefined} onOpenDateAdd={() => undefined} />
        </div>
        <PlannerChoiceGroup value={mode} onValueChange={(next) => next && setMode(next)} className="w-full sm:w-fit" aria-label="갤러리 이동 수단">
          <PlannerChoiceItem value="WALK" className="flex-1 sm:flex-none">도보</PlannerChoiceItem>
          <PlannerChoiceItem value="TRANSIT" className="flex-1 sm:flex-none">대중교통</PlannerChoiceItem>
          <PlannerChoiceItem value="DRIVE" className="flex-1 sm:flex-none">운전</PlannerChoiceItem>
        </PlannerChoiceGroup>
      </section>

      <section className="space-y-3" aria-labelledby="theme-forms">
        <div>
          <h3 id="theme-forms" className="font-semibold">Form controls</h3>
          <p className="text-sm text-muted-foreground">The same input, textarea, native select, checkbox, radio, and switch treatments are used in product screens.</p>
        </div>
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="gallery-trip-title">여행 이름</FieldLabel>
            <Input id="gallery-trip-title" className="min-h-11" defaultValue="오사카 2박 3일" />
            <FieldDescription>목록과 여행 상단에 표시됩니다.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="gallery-timezone">목적지 시간대</FieldLabel>
            <NativeSelect id="gallery-timezone" className="w-full [&>select]:min-h-11" defaultValue="Asia/Tokyo">
              <NativeSelectOption value="Asia/Seoul">Asia/Seoul</NativeSelectOption>
              <NativeSelectOption value="Asia/Tokyo">Asia/Tokyo</NativeSelectOption>
            </NativeSelect>
            <FieldDescription>모바일에서는 운영체제의 선택 UI를 사용합니다.</FieldDescription>
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="gallery-note">여행 메모</FieldLabel>
            <Textarea id="gallery-note" defaultValue="예약 번호와 만날 장소를 적어둡니다." />
          </Field>
        </FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldLabel className="rounded-lg border p-3">
            <Checkbox checked={checked} onCheckedChange={(next) => setChecked(next === true)} />
            <FieldContent><FieldTitle>기존 공유 종료</FieldTitle><FieldDescription>이 기기에서 위치 공유를 다시 시작합니다.</FieldDescription></FieldContent>
          </FieldLabel>
          <FieldLabel className="justify-between rounded-lg border p-3">
            <FieldContent><FieldTitle>내 위치 공유</FieldTitle><FieldDescription>변경 즉시 적용되는 설정입니다.</FieldDescription></FieldContent>
            <Switch checked={sharing} onCheckedChange={setSharing} aria-label="갤러리 위치 공유" />
          </FieldLabel>
        </div>
        <RadioGroup defaultValue="auto" className="grid gap-2 sm:grid-cols-3" aria-label="갤러리 시간 기준">
          {[["auto", "자동"], ["depart", "출발 시각"], ["arrive", "도착 시각"]].map(([value, label]) => (
            <FieldLabel key={value} className="rounded-lg border p-3"><RadioGroupItem value={value} /> {label}</FieldLabel>
          ))}
        </RadioGroup>
      </section>

      <section className="space-y-3" aria-labelledby="theme-navigation-feedback">
        <div>
          <h3 id="theme-navigation-feedback" className="font-semibold">Navigation, overlays, and feedback</h3>
          <p className="text-sm text-muted-foreground">Tabs switch content, popovers handle compact edits, sheets supplement the current screen, and badges communicate status.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>승인됨</Badge><Badge variant="secondary">24분</Badge><Badge variant="outline">시간 미정</Badge><Badge variant="destructive">저장 실패</Badge>
          <Popover><PopoverTrigger asChild><Button variant="outline">시간 편집</Button></PopoverTrigger><PopoverContent className="space-y-2"><p className="font-medium">출발 시각</p><Input type="time" defaultValue="10:45" /></PopoverContent></Popover>
          <Sheet><SheetTrigger asChild><Button variant="outline">참여자 관리</Button></SheetTrigger><SheetContent side="bottom"><SheetHeader><SheetTitle>같이 보는 사람</SheetTitle><SheetDescription>초대와 위치 공유 설정을 관리합니다.</SheetDescription></SheetHeader></SheetContent></Sheet>
        </div>
        <Tabs defaultValue="itinerary">
          <TabsList><TabsTrigger value="itinerary">일정</TabsTrigger><TabsTrigger value="places">장소</TabsTrigger></TabsList>
          <TabsContent value="itinerary" className="rounded-lg border p-4">선택한 날짜의 일정</TabsContent>
          <TabsContent value="places" className="rounded-lg border p-4">지도에서 선택한 장소</TabsContent>
        </Tabs>
        <div className="grid gap-3 sm:grid-cols-3" aria-label="공통 피드백 상태">
          <div className="space-y-3 rounded-lg border p-4" role="status"><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-full" /></div>
          <div className="rounded-lg border border-dashed p-4"><p className="font-medium">일정이 없습니다.</p><p className="text-sm text-muted-foreground">장소를 추가해 여행을 시작하세요.</p></div>
          <div className="rounded-lg border border-destructive/30 p-4" role="alert"><p className="font-medium">저장하지 못했습니다.</p><Button className="mt-3" variant="outline" size="sm">다시 시도</Button></div>
        </div>
      </section>
    </div>
  );
}
