import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("date action style scope", () => {
  it("keeps pill styling on date tabs without overriding the shadcn split button", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(css).toContain(".day-tabs .day-tab {");
    expect(css).toContain(".day-tabs .day-tab.active {");
    expect(css).not.toMatch(/\.day-tabs\s+button(?:\.[\w-]+)?\s*\{/);
  });
});
