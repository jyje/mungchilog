import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} is missing from index.css`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

describe("itinerary panel layout", () => {
  it("keeps the itinerary panel from scrolling sideways", () => {
    // overflow-y alone leaves overflow-x computing to auto, which turned one
    // over-wide line into a horizontally scrolling panel.
    expect(rule(".panel-content")).toContain("overflow-x: hidden;");
  });

  it("lets a full opening-hours line wrap instead of widening the spot card", () => {
    const openingHours = rule(".opening-hours-summary");

    expect(openingHours).toContain("white-space: normal;");
    expect(openingHours).toContain("max-width: 100%;");
    // shadcn's Button size sets a fixed height, which would clip a second line.
    expect(openingHours).toContain("height: auto;");
  });

  it("scrolls only the dates so the date actions cannot be overlapped", () => {
    const tabs = rule(".day-tabs");
    const scroller = rule(".day-tabs-scroll");
    const group = rule(".day-choice-group");

    expect(tabs).not.toContain("overflow-x");
    expect(scroller).toContain("overflow-x: auto;");
    expect(scroller).toContain("min-width: 0;");
    // The group carries max-w-full from PlannerChoiceGroup: clamped inside a
    // scroller, its chips would overflow their own box and paint over the
    // add and manage actions that follow.
    expect(group).toContain("max-width: none;");
    expect(rule(".day-tabs-actions")).toContain("flex: none;");
  });
});
