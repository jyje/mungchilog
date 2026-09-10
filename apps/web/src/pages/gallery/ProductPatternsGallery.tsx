import { useState } from "react";
import { BedDouble, Plane } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PlannerChoiceGroup, PlannerChoiceItem } from "@/components/system/PlannerChoiceGroup";

export function ProductPatternsGallery() {
  const [mode, setMode] = useState("TRANSIT");
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <article className="space-y-3 rounded-lg border p-4" style={{ background: "var(--stay-soft)", borderColor: "var(--stay-line)" }}>
        <Badge variant="outline" style={{ color: "var(--stay)", borderColor: "var(--stay-line)" }}><BedDouble /> 숙박</Badge>
        <h3 className="font-semibold">The Royal Park Canvas Osaka Kitahama</h3>
        <p className="text-sm">9월 7일 15:00 체크인 · 9월 9일 11:00 체크아웃</p>
        <p className="text-sm text-muted-foreground">Accommodation is identified by an icon and label as well as category color.</p>
      </article>
      <section className="min-w-0 space-y-4">
        <h3 className="font-semibold">Travel choices and availability</h3>
        <PlannerChoiceGroup value={mode} onValueChange={value => value && setMode(value)} aria-label="Product pattern travel mode" className="flex-wrap">
          <PlannerChoiceItem value="WALK">도보</PlannerChoiceItem>
          <PlannerChoiceItem value="TRANSIT">대중교통</PlannerChoiceItem>
          <PlannerChoiceItem value="DRIVE">운전</PlannerChoiceItem>
          <PlannerChoiceItem value="FLIGHT"><Plane /> 항공</PlannerChoiceItem>
        </PlannerChoiceGroup>
        {mode === "FLIGHT" ? (
          <div className="space-y-3 rounded-lg border p-4">
            <label htmlFor="gallery-flight" className="block text-sm font-medium">항공편</label>
            <Input id="gallery-flight" defaultValue="KE721" />
            <p className="text-sm text-muted-foreground">수동 입력 · 항공편 시간과 공항은 직접 확인합니다. 도로 경로를 요청하지 않습니다.</p>
          </div>
        ) : <p className="text-sm" role="status">예시 경로 · 24분 · 저장한 이동 수단 유지</p>}
        <div className="space-y-2 border-t pt-3 text-sm">
          <p><Badge variant="outline">경로 없음</Badge> 선택한 수단은 유지하고 재시도를 안내합니다.</p>
          <p><Badge variant="outline">제공자 응답 지연</Badge> 이전 결과의 출처와 조회 시각을 함께 표시합니다.</p>
          <p><Badge variant="outline">오프라인</Badge> 저장한 일정은 표시하고 새 경로 조회는 연결 후 시도합니다.</p>
        </div>
      </section>
    </div>
  );
}
