import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import "./planner-panel-tabs.css";

export type PlannerPanelTab = "itinerary" | "places";

export function PlannerPanelTabs({
  value,
  onValueChange,
  itinerary,
  places,
  placeSelected = false,
}: {
  value: PlannerPanelTab;
  onValueChange: (value: PlannerPanelTab) => void;
  itinerary: ReactNode;
  places: ReactNode;
  placeSelected?: boolean;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as PlannerPanelTab)} className="planner-panel-tabs">
      <TabsList className="planner-panel-tab-list" aria-label="여행 계획 보기">
        <TabsTrigger value="itinerary">일정</TabsTrigger>
        <TabsTrigger value="places">
          장소{placeSelected && <span className="planner-place-indicator" aria-label="선택한 장소 있음" />}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="itinerary" className="planner-panel-tab-content">{itinerary}</TabsContent>
      <TabsContent value="places" className="planner-panel-tab-content">{places}</TabsContent>
    </Tabs>
  );
}
