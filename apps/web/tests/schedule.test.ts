import { describe, expect, it } from "vitest";
import { effectiveTimeKind, resolveTripWallClock, routeDepartureIso, scheduleWarnings, spotScheduleDisplay } from "../src/schedule";

describe("itinerary schedule semantics", () => {
  it("treats legacy arrival times as approximate without rewriting them", () => {
    expect(effectiveTimeKind({ plannedArrival: "10:30" })).toBe("APPROXIMATE");
    expect(effectiveTimeKind({})).toBeNull();
  });

  it("formats reservation ranges and midnight crossings", () => {
    expect(spotScheduleDisplay({ plannedArrival: "23:30", timeKind: "RESERVATION", dwellMinutes: 90 })).toEqual({
      kind: "RESERVATION",
      label: "예약",
      start: "23:30",
      end: "01:00",
      durationMinutes: 90,
      crossesMidnight: true,
    });
  });

  it("reports overlaps without modifying itinerary order", () => {
    const spots = [
      { id: "museum", plannedArrival: "10:00", dwellMinutes: 120 },
      { id: "lunch", plannedArrival: "11:30", dwellMinutes: 60 },
      { id: "park", plannedArrival: "09:00", dwellMinutes: 30 },
    ];
    expect(scheduleWarnings(spots)).toEqual([
      { spotId: "lunch", message: "앞 일정의 예상 종료 12:00와 겹칩니다." },
      { spotId: "park", message: "앞 일정의 시각보다 이릅니다. 순서를 확인해주세요." },
    ]);
    expect(spots.map((spot) => spot.id)).toEqual(["museum", "lunch", "park"]);
  });

  it("does not infer an overlap across an unscheduled stop", () => {
    expect(scheduleWarnings([
      { id: "museum", plannedArrival: "10:00", dwellMinutes: 180 },
      { id: "walk-in" },
      { id: "dinner", plannedArrival: "11:00" },
    ])).toEqual([]);
  });

  it("derives departure after dwell time in the trip timezone", () => {
    expect(routeDepartureIso(
      "2026-10-01",
      { plannedArrival: "10:30", dwellMinutes: 90 },
      "Europe/Paris",
    )).toBe("2026-10-01T10:00:00.000Z");
    expect(routeDepartureIso("2026-10-01", {}, "Asia/Seoul")).toBe("2026-10-01T03:00:00.000Z");
  });

  it("detects a nonexistent daylight-saving wall time without moving it backwards", () => {
    expect(resolveTripWallClock("2026-03-08", "02:30", "America/New_York")).toEqual({
      iso: "2026-03-08T07:30:00.000Z",
      exact: false,
    });
    expect(scheduleWarnings([
      { id: "gap", plannedArrival: "02:30" },
    ], "2026-03-08", "America/New_York")).toEqual([
      {
        spotId: "gap",
        message: "이 시각은 여행지 표준시의 일광 절약 시간 전환으로 존재하지 않습니다. 다른 시각을 선택해주세요.",
      },
    ]);
  });
});
