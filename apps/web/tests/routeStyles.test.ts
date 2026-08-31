import { describe, expect, it } from "vitest";

import {
  connectorStroke,
  ROUTE_LINE_COLORS,
  ROUTE_LINE_LEGEND,
  routeDirectionIcons,
  routeEmphasis,
  routeSegmentKind,
  routeStrokeLayers,
} from "../src/routeStyles";

describe("classifying a drawn piece of route", () => {
  it("follows the provider's per-step mode when it exists", () => {
    // This is the only thing that separates the walk to the station from the
    // ride itself; both belong to a leg whose saved mode is TRANSIT.
    expect(routeSegmentKind("TRANSIT", "WALK")).toBe("WALK");
    expect(routeSegmentKind("TRANSIT", "TRANSIT")).toBe("RIDE");
  });

  it("falls back to the leg's own mode when no step mode came back", () => {
    expect(routeSegmentKind("TRANSIT")).toBe("RIDE");
    expect(routeSegmentKind("WALK")).toBe("WALK");
    expect(routeSegmentKind("DRIVE")).toBe("RIDE");
    expect(routeSegmentKind("WALK", null)).toBe("WALK");
  });

  it("treats an unfamiliar provider mode as riding rather than walking", () => {
    // Bicycle and two-wheeler legs are reachable through imports. Drawing them
    // as walking would be a lie; riding is the safe default.
    expect(routeSegmentKind("TRANSIT", "BICYCLE")).toBe("RIDE");
  });
});

describe("emphasis", () => {
  it("ranks the selected leg, the neutral state, and the backgrounded rest", () => {
    expect(routeEmphasis(true, true)).toBe("selected");
    expect(routeEmphasis(false, true)).toBe("dimmed");
    expect(routeEmphasis(false, false)).toBe("default");
  });
});

describe("the casing that lifts a route off the basemap", () => {
  it("draws white under the colour, wider than it", () => {
    const { casing, core } = routeStrokeLayers({ kind: "RIDE", emphasis: "default" });
    expect(casing?.strokeColor).toBe(ROUTE_LINE_COLORS.casing);
    expect(casing!.strokeWeight).toBeGreaterThan(core.strokeWeight);
    expect(core.zIndex).toBeGreaterThan(casing!.zIndex);
  });

  it("keeps the mode colour on the selected leg and moves amber to the casing", () => {
    // Recolouring the whole line amber would discard the walk/ride signal on
    // exactly the leg the user is looking at.
    const walk = routeStrokeLayers({ kind: "WALK", emphasis: "selected" });
    expect(walk.core.strokeColor).toBe(ROUTE_LINE_COLORS.walk);
    expect(walk.casing?.strokeColor).toBe(ROUTE_LINE_COLORS.selected);
  });

  it("omits the casing when dimmed", () => {
    // White at low opacity over Google's near-white land disappears and muddies
    // the core. This is a deliberate absence, not an oversight.
    const dimmed = routeStrokeLayers({ kind: "RIDE", emphasis: "dimmed" });
    expect(dimmed.casing).toBeNull();
    // With the casing gone the core needs its opacity back to stay visible.
    expect(dimmed.core.strokeOpacity).toBeGreaterThan(0.28);
    expect(dimmed.core.strokeWeight).toBeLessThan(
      routeStrokeLayers({ kind: "RIDE", emphasis: "default" }).core.strokeWeight,
    );
  });

  it("stacks selected above default above dimmed", () => {
    const z = (emphasis: "selected" | "default" | "dimmed") =>
      routeStrokeLayers({ kind: "RIDE", emphasis }).core.zIndex;
    expect(z("selected")).toBeGreaterThan(z("default"));
    expect(z("default")).toBeGreaterThan(z("dimmed"));
  });

  it("keeps every casing beneath its own core", () => {
    for (const emphasis of ["selected", "default", "dimmed"] as const) {
      for (const kind of ["RIDE", "WALK"] as const) {
        const { casing, core } = routeStrokeLayers({ kind, emphasis });
        if (casing) expect(core.zIndex).toBeGreaterThan(casing.zIndex);
      }
    }
  });

  it("colours access connectors like the leg they bridge", () => {
    // The connectors belong to their leg. Left on the ride colour they would
    // end a green walking leg in blue dots.
    expect(connectorStroke("default", "WALK").strokeColor).toBe(ROUTE_LINE_COLORS.walk);
    expect(connectorStroke("default", "RIDE").strokeColor).toBe(ROUTE_LINE_COLORS.ride);
    // Selection still overrides both, matching the casing.
    expect(connectorStroke("selected", "WALK").strokeColor).toBe(ROUTE_LINE_COLORS.selected);
  });

  it("puts access connectors above every route line", () => {
    const highest = routeStrokeLayers({ kind: "RIDE", emphasis: "selected" }).core.zIndex;
    expect(connectorStroke("default").zIndex).toBeGreaterThan(highest);
  });
});

describe("walking reads differently from riding", () => {
  it("uses a distinct colour", () => {
    const ride = routeStrokeLayers({ kind: "RIDE", emphasis: "default" }).core.strokeColor;
    const walk = routeStrokeLayers({ kind: "WALK", emphasis: "default" }).core.strokeColor;
    expect(walk).not.toBe(ride);
    expect(ride).toBe(ROUTE_LINE_COLORS.ride);
    expect(walk).toBe(ROUTE_LINE_COLORS.walk);
  });

  it("ticks more tightly on foot, so the rhythm reads before the colour does", () => {
    const walk = routeDirectionIcons({ kind: "WALK", emphasis: "default" })[0];
    const ride = routeDirectionIcons({ kind: "RIDE", emphasis: "default" })[0];
    expect(parseInt(walk.repeat, 10)).toBeLessThan(parseInt(ride.repeat, 10));
  });

  it("never references a google.maps symbol constant", () => {
    // The module must stay importable under jsdom, where no Maps API exists.
    // A SymbolPath constant here would break every test that loads it.
    for (const kind of ["RIDE", "WALK"] as const) {
      const [icon] = routeDirectionIcons({ kind, emphasis: "default" });
      expect(typeof icon.icon.path).toBe("string");
      expect(icon.icon.path).toMatch(/^[Mm]/);
    }
  });

  it("drops the ticks on the selected leg", () => {
    expect(routeDirectionIcons({ kind: "RIDE", emphasis: "selected" })).toEqual([]);
  });
});

describe("the unresolved straight-line preview", () => {
  it("is greyed rather than dressed up as a real route", () => {
    const { core } = routeStrokeLayers({ kind: "RIDE", emphasis: "default", fallback: true });
    expect(core.strokeColor).toBe(ROUTE_LINE_COLORS.fallback);
    expect(core.strokeColor).not.toBe(ROUTE_LINE_COLORS.ride);
  });

  it("still gets a casing, thinner than a real route's", () => {
    const fallback = routeStrokeLayers({ kind: "RIDE", emphasis: "default", fallback: true });
    const real = routeStrokeLayers({ kind: "RIDE", emphasis: "default" });
    expect(fallback.casing).not.toBeNull();
    expect(fallback.core.strokeWeight).toBeLessThan(real.core.strokeWeight);
  });
});

describe("the legend that documents all of this", () => {
  it("covers the four styles that carry meaning", () => {
    const ids = ROUTE_LINE_LEGEND.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining(["transit-ride", "transit-walk", "selected", "dimmed"]));
  });

  it("gives every row a unique id and non-empty copy", () => {
    expect(new Set(ROUTE_LINE_LEGEND.map((row) => row.id)).size).toBe(ROUTE_LINE_LEGEND.length);
    for (const row of ROUTE_LINE_LEGEND) {
      expect(row.label.trim()).not.toBe("");
      expect(row.description.trim()).not.toBe("");
    }
  });

  it("reuses the mode picker's labels so the two cannot drift", () => {
    expect(ROUTE_LINE_LEGEND.find((row) => row.id === "transit-ride")?.label).toContain("대중교통");
    expect(ROUTE_LINE_LEGEND.find((row) => row.id === "walk-leg")?.label).toContain("도보");
    expect(ROUTE_LINE_LEGEND.find((row) => row.id === "drive-leg")?.label).toContain("운전");
  });

  it("resolves every row through the same function the map uses", () => {
    for (const row of ROUTE_LINE_LEGEND) {
      const { core } = routeStrokeLayers(row);
      expect(core.strokeColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
