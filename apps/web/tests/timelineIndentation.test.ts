import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Read as text on purpose, same reasoning as themeTokens.test.ts: jsdom does
// not compute CSS Grid track sizes, so a rendering test cannot see two
// independent grids (.spot-card, .leg-row) disagree on where their shared
// second column starts. That mismatch - a leg card rendering visibly left of
// the spot card above it - only shows up by reading the declared track
// sizes themselves.

const CSS_PATH = join(__dirname, "../src/index.css");
// Comments stripped first: a selector can sit right after a /* ... */ block
// (as one now does, documenting exactly this bug), which would otherwise
// break the prefix this file's regex expects before a selector.
const css = readFileSync(CSS_PATH, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every `grid-template-columns` value declared for exactly this selector. */
function gridTemplateColumnsFor(selector: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`(?:^|[,{}]\\s*)${selector.replace(/[.]/g, "\\.")}\\s*(?:,[^{]*)?\\{[^}]*\\}`, "gs");
  for (const match of css.matchAll(pattern)) {
    const declaration = /grid-template-columns:\s*([^;]+);/.exec(match[0]);
    if (declaration) values.push(declaration[1].trim());
  }
  return values;
}

/** The declarations inside the first top-level block for exactly this selector. */
function blockFor(selector: string): string {
  const pattern = new RegExp(`(?:^|[,{}]\\s*)${selector.replace(/[.]/g, "\\.")}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "s");
  const match = pattern.exec(css);
  if (!match) throw new Error(`no block for selector: ${selector}`);
  return match[1];
}

describe("the timeline's first column stays the same width on every row", () => {
  it(".spot-card and .leg-row never use a flexible (minmax) first column", () => {
    // .spot-card and .leg-row are each their own independent CSS Grid (no
    // shared parent grid/subgrid across the itinerary list), so a minmax()
    // range resolves per row based on that row's own content: a spot's
    // visible time text stretched it wide, a leg-row's empty dashed line
    // collapsed it narrow, and the second column (the actual card) started
    // at a different x per row. A fixed first track is what guarantees every
    // row's content column starts at the same x regardless of what that row
    // happens to contain.
    for (const values of [gridTemplateColumnsFor(".spot-card"), gridTemplateColumnsFor(".leg-row")]) {
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) expect(value).not.toMatch(/minmax\(\s*[\d.]+rem\s*,/);
    }
  });

  it(".spot-card and .leg-row declare the identical first column width at every breakpoint", () => {
    const spotCardColumns = gridTemplateColumnsFor(".spot-card");
    const legRowColumns = gridTemplateColumnsFor(".leg-row");
    expect(spotCardColumns).toEqual(legRowColumns);
  });
});

describe("the leg connector reads as a real line, not a maybe", () => {
  it("is solid, not dashed or dotted", () => {
    // Dashed/dotted is a deliberate signal for tentative, editable, or
    // conditional state in common timeline conventions (Material UI's
    // TimelineConnector has no dashed variant at all - solid is the only
    // option). This line connects every leg unconditionally, confirmed or
    // not, so a permanent dashed style misapplied that signal - and its
    // color-mix-diluted opacity made it barely visible either way.
    const block = blockFor(".leg-row::before");
    expect(block).toMatch(/border-left:\s*[\d.]+px\s+solid\s+var\(--text-muted\)/);
    expect(block).not.toMatch(/dashed|dotted/);
  });
});
