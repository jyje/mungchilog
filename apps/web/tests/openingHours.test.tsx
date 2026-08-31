import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpeningHours } from "../src/components/OpeningHours";
import { TooltipProvider } from "../src/components/ui/tooltip";

const descriptions = ["월요일: 오전 9:00~오후 6:00", "화요일: 오전 9:00~오후 6:00", "수요일: 오전 9:00~오후 6:00", "목요일: 오전 9:00~오후 6:00", "금요일: 오전 9:00~오후 6:00", "토요일: 오전 10:00~오후 4:00", "일요일: 휴무"];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ regularOpeningHours: { weekdayDescriptions: descriptions }, fetchedAt: "2026-08-29T00:00:00Z" }),
  }));
});

describe("opening hours tooltip", () => {
  it("uses the shared tooltip primitive for hover and an explicit tap", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={0}>
          <OpeningHours placeId="place-1" date="2026-08-29" />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    const summary = await screen.findByRole("button", { name: /전체 영업시간 보기/ });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.click(summary);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("전체 영업시간");
    expect(summary).toHaveAttribute("aria-expanded", "true");
  });
});
