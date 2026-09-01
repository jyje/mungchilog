import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GalleryPage } from "../src/pages/GalleryPage";
import { TooltipProvider } from "../src/components/ui/tooltip";

describe("gallery light theme", () => {
  beforeEach(() => {
    const values = new Map<string, string>([["mungchilog-theme", "light"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  it("renders light-theme neutral button compositions inside the gallery", () => {
    render(<TooltipProvider><GalleryPage /></TooltipProvider>);

    const [outline] = screen.getAllByRole("button", { name: "초대하기" });
    const [ghost] = screen.getAllByRole("button", { name: "취소" });
    const gallery = screen.getByRole("main");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(gallery).toHaveClass("component-gallery", "bg-background", "text-foreground");
    expect(outline).toHaveAttribute("data-variant", "outline");
    expect(ghost).toHaveAttribute("data-variant", "ghost");
    expect(gallery.querySelectorAll('[data-slot="button"][data-variant="outline"], [data-slot="button"][data-variant="ghost"]')).not.toHaveLength(0);
  });

  it("keeps planner alternatives and review states visible in both themes", () => {
    render(<TooltipProvider><GalleryPage /></TooltipProvider>);

    expect(screen.getByRole("radiogroup", { name: "Route alternatives" })).toBeVisible();
    expect(screen.getByText("No place selected")).toBeVisible();
    const routeAlert = screen.getByText("Route unavailable").closest('[role="alert"]');
    expect(routeAlert).not.toBeNull();
    expect(routeAlert).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "다크 테마로 전환" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("radiogroup", { name: "Route alternatives" })).toBeVisible();
    expect(screen.getByText("Route unavailable").closest('[role="alert"]')).toBeVisible();
  });
});

describe("route line legend", () => {
  it("documents riding and walking as visibly different lines", () => {
    render(
      <TooltipProvider>
        <GalleryPage />
      </TooltipProvider>,
    );
    const gallery = screen.getByRole("main");

    const ride = gallery.querySelector('[data-route-legend-row="transit-ride"]');
    const walk = gallery.querySelector('[data-route-legend-row="transit-walk"]');
    expect(ride).not.toBeNull();
    expect(walk).not.toBeNull();

    const rideColor = ride!.getAttribute("data-route-core-color");
    const walkColor = walk!.getAttribute("data-route-core-color");
    expect(rideColor).not.toBe(walkColor);
    // Pinned so a future palette edit has to be deliberate: these are the
    // values chosen to separate from Google's water and parks.
    expect(rideColor).toBe("#0284c7");
    expect(walkColor).toBe("#16a34a");
  });

  it("keeps the deliberate absence of a casing on the dimmed row", () => {
    render(
      <TooltipProvider>
        <GalleryPage />
      </TooltipProvider>,
    );
    const gallery = screen.getByRole("main");
    // White at low opacity over a near-white basemap disappears and muddies
    // the core, so dimmed legs draw the core alone. This is the decision most
    // likely to be "fixed" back by a later edit.
    expect(gallery.querySelector('[data-route-legend-row="dimmed"]')).toHaveAttribute("data-route-casing", "none");
    expect(gallery.querySelector('[data-route-legend-row="transit-ride"]')).toHaveAttribute("data-route-casing", "#ffffff");
    expect(gallery.querySelector('[data-route-legend-row="selected"]')).toHaveAttribute("data-route-casing", "#f59e0b");
  });

  it("labels every swatch for screen readers", () => {
    render(
      <TooltipProvider>
        <GalleryPage />
      </TooltipProvider>,
    );
    expect(screen.getByRole("img", { name: /대중교통 · 탑승 구간/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /대중교통 · 도보 구간/ })).toBeInTheDocument();
  });

  it("explains how to enable the real route example when no map key is configured", () => {
    render(
      <TooltipProvider>
        <GalleryPage />
      </TooltipProvider>,
    );

    expect(screen.getByRole("status", { name: "실제 지도 길찾기 상태" })).toHaveTextContent("실제 지도 길찾기");
    expect(screen.getByText(/Google Maps 브라우저 키를 설정하면/)).toBeVisible();
  });

  it("publishes the screen-pixel widths next to every documented style", () => {
    render(
      <TooltipProvider>
        <GalleryPage />
      </TooltipProvider>,
    );
    const gallery = screen.getByRole("main");
    expect(gallery.querySelector('[data-route-legend-row="transit-ride"]')).toHaveAttribute(
      "data-route-core-width",
      "4",
    );
    expect(gallery.querySelector('[data-route-legend-row="selected"]')).toHaveAttribute(
      "data-route-casing-width",
      "11",
    );
  });
});
