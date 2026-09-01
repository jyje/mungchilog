import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("date action style scope", () => {
  it("keeps product CSS from repainting shadcn date controls", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(css).toContain(".day-choice-group {");
    expect(css).not.toContain(".day-tabs .day-tab {");
    expect(css).not.toContain(".day-tabs .day-tab.active {");
    expect(css).not.toMatch(/\.day-tabs\s+button(?:\.[\w-]+)?\s*\{/);
  });

  it("does not replace shadcn pressed feedback with the legacy scale effect", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(css).toContain("button:not([data-slot]):active {");
    expect(css).not.toMatch(/(?:^|\n)button:active\s*\{/);
  });

  it("does not repaint shadcn destructive actions or date inputs", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(css).not.toMatch(/\.trip-delete\s*\{[^}]*background:/s);
    expect(css).not.toMatch(/\.day-date-popover\s+input\s*\{/);
  });
});
