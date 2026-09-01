import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MapControlRail } from "../src/components/system/MapControlRail";
import { MapViewportProvider } from "../src/components/MapViewportContext";

function setRect(element: Element, rect: { left: number; top: number; right: number; bottom: number }) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    ...rect,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
    toJSON: () => rect,
  } as DOMRect);
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});

describe("MapControlRail", () => {
  it("moves the app rail inward while keeping it at the lower map edge", async () => {
    const view = render(
      <MapViewportProvider value={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <div className="map-container">
          <MapControlRail>
            <button type="button">현재 위치</button>
            <button type="button">따라가기</button>
          </MapControlRail>
          <div className="gm-control-active" />
        </div>
      </MapViewportProvider>,
    );
    const map = view.container.querySelector(".map-container")!;
    const native = view.container.querySelector(".gm-control-active")!;
    const rail = view.container.querySelector(".map-control-rail")!;
    setRect(map, { left: 0, top: 0, right: 360, bottom: 800 });
    setRect(native, { left: 276, top: 610, right: 360, bottom: 800 });
    window.dispatchEvent(new Event("resize"));

    await waitFor(() => expect(rail).toHaveStyle({ left: "208px", top: "688px", right: "auto", bottom: "auto" }));
    expect(rail).toHaveAttribute("data-placement", "right");
  });

  it("keeps the rail clear of upper-right controls and map attribution", async () => {
    const view = render(
      <MapViewportProvider value={{ top: 88, right: 0, bottom: 0, left: 0 }}>
        <div className="map-container">
          <MapControlRail>
            <button type="button">현재 위치</button>
            <button type="button">따라가기</button>
          </MapControlRail>
          <div className="gm-control-active" />
          <div className="gm-svpc" />
          <div className="gm-style-cc" />
        </div>
      </MapViewportProvider>,
    );
    const map = view.container.querySelector(".map-container")!;
    const [zoom, streetView, attribution] = Array.from(view.container.querySelectorAll(".gm-control-active, .gm-svpc, .gm-style-cc"));
    const rail = view.container.querySelector(".map-control-rail")!;
    setRect(map, { left: 0, top: 0, right: 1280, bottom: 418 });
    setRect(zoom, { left: 1230, top: 282, right: 1270, bottom: 322 });
    setRect(streetView, { left: 1230, top: 354, right: 1270, bottom: 394 });
    setRect(attribution, { left: 1025, top: 404, right: 1270, bottom: 418 });
    window.dispatchEvent(new Event("resize"));

    await waitFor(() => expect(rail).toHaveStyle({ left: "957px", top: "306px", right: "auto", bottom: "auto" }));
    expect(rail).toHaveAttribute("data-placement", "right");
  });

  it("recalculates when Google controls mount after the map", async () => {
    const view = render(
      <MapViewportProvider value={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <div className="map-container">
          <MapControlRail>
            <button type="button">현재 위치</button>
            <button type="button">따라가기</button>
          </MapControlRail>
        </div>
      </MapViewportProvider>,
    );
    const map = view.container.querySelector(".map-container")!;
    const rail = view.container.querySelector(".map-control-rail")!;
    setRect(map, { left: 0, top: 0, right: 360, bottom: 800 });
    window.dispatchEvent(new Event("resize"));
    await waitFor(() => expect(rail).toHaveStyle({ left: "304px", top: "688px" }));

    const native = document.createElement("div");
    native.className = "gm-svpc";
    view.container.querySelector(".map-container")!.append(native);
    setRect(native, { left: 276, top: 610, right: 360, bottom: 800 });

    await waitFor(() => expect(rail).toHaveStyle({ left: "208px", top: "688px" }));
  });
});
