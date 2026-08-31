import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// These assertions read index.css as TEXT on purpose.
//
// jsdom does not load stylesheets, resolve custom properties, or evaluate
// prefers-color-scheme, and toBeVisible() only inspects display/visibility.
// So a rendering test cannot see a white-on-white foreground - which is
// exactly how this bug survived two previous fixes. Checking the source is
// blunt, but it is the only automated guard that actually holds.

const CSS_PATH = join(__dirname, "../src/index.css");
const css = readFileSync(CSS_PATH, "utf8");

/** The declarations inside one top-level block, by its selector text. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no block for selector: ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated block: ${selector}`);
}

describe("color-scheme follows an explicit theme choice", () => {
  it("narrows to light when the user picks light", () => {
    // Without this, an OS-dark machine forced to light keeps UA defaults in
    // dark mode: near-white placeholders, input text, and scrollbars painted
    // over this theme's white surfaces.
    expect(block(':root[data-theme="light"]')).toMatch(/color-scheme:\s*light\s*;/);
  });

  it("narrows to dark when the user picks dark", () => {
    expect(block(':root[data-theme="dark"]')).toMatch(/color-scheme:\s*dark\s*;/);
  });

  it("leaves the bare root free to follow the OS", () => {
    expect(block(":root")).toMatch(/color-scheme:\s*light dark\s*;/);
  });
});

describe("shadcn's accent surface is separate from the brand accent", () => {
  it("does not map --color-accent to the brand token", () => {
    // The brand --accent is read by ~20 product rules and by --primary,
    // --ring, and --sidebar-primary. shadcn's accent is a hover surface that
    // components pair with text-accent-foreground; conflating them made that
    // foreground white in the light theme.
    expect(css).toMatch(/--color-accent:\s*var\(--ui-accent\)/);
    expect(css).toMatch(/--color-accent-foreground:\s*var\(--ui-accent-foreground\)/);
    expect(css).not.toMatch(/--color-accent:\s*var\(--accent\)\s*;/);
  });

  it("keeps the accent surface foreground on the readable text token", () => {
    expect(block(":root")).toMatch(/--ui-accent-foreground:\s*var\(--text\)/);
    // --accent-contrast is white in light theme; it belongs on the brand fill
    // (--primary-foreground), never on a neutral surface.
    expect(block(":root")).not.toMatch(/--ui-accent-foreground:\s*var\(--accent-contrast\)/);
  });

  it("leaves the brand pair intact", () => {
    expect(block(":root")).toMatch(/--primary:\s*var\(--accent\)/);
    expect(block(":root")).toMatch(/--primary-foreground:\s*var\(--accent-contrast\)/);
  });
});

describe("every foreground token the components use is defined", () => {
  const UI_DIR = join(__dirname, "../src/components/ui");
  const used = new Set<string>();
  for (const file of readdirSync(UI_DIR)) {
    if (!file.endsWith(".tsx")) continue;
    const source = readFileSync(join(UI_DIR, file), "utf8");
    for (const match of source.matchAll(/\b(?:text|bg|border|ring|fill|stroke)-([a-z-]*foreground)\b/g)) {
      used.add(match[1]);
    }
  }

  it("finds the foreground utilities in use", () => {
    // Guards the scan itself: a regex that silently matches nothing would
    // make every assertion below pass for the wrong reason.
    expect(used.size).toBeGreaterThan(3);
  });

  it("maps each of them to a defined custom property", () => {
    const missing = [...used].filter((token) => !css.includes(`--color-${token}:`));
    expect(missing).toEqual([]);
  });

  it("resolves each mapped property to a value declared on :root", () => {
    const root = block(":root");
    const unresolved = [...used].filter((token) => {
      const mapping = new RegExp(`--color-${token}:\\s*var\\((--[a-z-]+)\\)`).exec(css);
      if (!mapping) return true;
      return !root.includes(`${mapping[1]}:`);
    });
    expect(unresolved).toEqual([]);
  });
});
