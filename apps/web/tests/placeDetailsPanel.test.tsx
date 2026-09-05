import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceDetailsPanel } from "../src/components/PlaceDetailsPanel";
import { PlannerPanelTabs } from "../src/components/system/PlannerPanelTabs";

function renderDetails(onAdd = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PlaceDetailsPanel
        selection={{ placeId: "tokyo-station", lat: 35.6812, lng: 139.7671 }}
        onAdd={onAdd}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return onAdd;
}

afterEach(() => vi.unstubAllGlobals());

describe("place discovery panel", () => {
  it("renders minimal place details and adds only after explicit confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      details: {
        id: "tokyo-station",
        displayName: "도쿄역",
        formattedAddress: "1 Chome Marunouchi",
        location: { latitude: 35.6812, longitude: 139.7671 },
        category: "기차역",
        rating: 4.4,
        userRatingCount: 1234,
        regularOpeningHours: null,
        websiteUri: "https://example.com",
        nationalPhoneNumber: null,
        googleMapsUri: "https://maps.google.com/",
      },
      fetchedAt: "2026-08-31T00:00:00.000Z",
    }), { status: 200 })));
    const onAdd = renderDetails();

    expect(await screen.findByRole("heading", { name: "도쿄역" })).toBeVisible();
    expect(screen.getByText("1 Chome Marunouchi")).toBeVisible();
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "일정에 추가" }));
    expect(onAdd).toHaveBeenCalledWith({
      name: "도쿄역",
      placeId: "tokyo-station",
      lat: 35.6812,
      lng: 139.7671,
      category: "기차역",
    });
  });

  it("labels cached details when the provider fallback is stale", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      details: {
        id: "tokyo-station",
        displayName: "도쿄역",
        formattedAddress: "1 Chome Marunouchi",
        location: { latitude: 35.6812, longitude: 139.7671 },
        category: "기차역",
        rating: null,
        userRatingCount: null,
        regularOpeningHours: null,
        websiteUri: null,
        nationalPhoneNumber: null,
        googleMapsUri: null,
      },
      fetchedAt: "2026-07-01T00:00:00.000Z",
    }), { status: 200, headers: { "X-Cache": "stale" } })));

    renderDetails();

    expect(await screen.findByRole("status")).toHaveTextContent("저장된 장소 정보");
  });

  it("keeps itinerary and place content in accessible tabs", () => {
    const onValueChange = vi.fn();
    render(
      <PlannerPanelTabs
        value="itinerary"
        onValueChange={onValueChange}
        itinerary={<p>일정 내용</p>}
        places={<p>장소 내용</p>}
        placeSelected
      />,
    );

    expect(screen.getByRole("tab", { name: "일정" })).toHaveAttribute("aria-selected", "true");
    const placesTab = screen.getByRole("tab", { name: /장소/ });
    fireEvent.mouseDown(placesTab, { button: 0, ctrlKey: false });
    fireEvent.click(placesTab);
    expect(onValueChange).toHaveBeenCalledWith("places");
    expect(screen.getByLabelText("선택한 장소 있음")).toBeInTheDocument();
  });
});
