import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { CurrentLocation } from "../src/components/CurrentLocation";

// Every .map-icon-button is a shadcn Button rendered inside MapIconButton's
// <TooltipTrigger asChild>. Radix's Slot merges TooltipTrigger's own
// data-slot="tooltip-trigger" onto the underlying button element, which
// overwrites Button's own data-slot="button" - so CSS gated on
// [data-slot="button"] never matches these controls at all. That was the
// real cause behind the current-location/follow buttons reading as bare,
// chromeless icons on the live map: none of map-icon-button.css's rules
// (including a prior "raise the opacity" fix) were ever applied.

const CSS_PATH = join(__dirname, "../src/components/system/map-icon-button.css");
const css = readFileSync(CSS_PATH, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("a MapIconButton's actual data-slot, once wrapped in a tooltip", () => {
  it("is overwritten to tooltip-trigger, not left as button", () => {
    render(
      <TooltipProvider delayDuration={0}>
        <CurrentLocation />
      </TooltipProvider>,
    );
    const button = screen.getByRole("button", { name: "현재 위치" });
    expect(button).toHaveClass("map-icon-button");
    expect(button).not.toHaveAttribute("data-slot", "button");
  });
});

describe("map-icon-button.css styles the class, not a data-slot value that never survives the tooltip wrap", () => {
  it("never gates a rule on [data-slot=\"button\"]", () => {
    expect(css).not.toMatch(/\.map-icon-button\[data-slot=["']button["']\]/);
  });

  it("still declares the translucent background and blur on the bare .map-icon-button class", () => {
    expect(css).toMatch(/\.map-icon-button\s*\{[^}]*backdrop-filter:\s*blur/s);
  });
});
