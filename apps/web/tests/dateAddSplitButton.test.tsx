import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateAddSplitButton } from "../src/components/system/DateAddSplitButton";

describe("DateAddSplitButton", () => {
  it("keeps the default and custom date actions in one connected button group", async () => {
    const onAddDay = vi.fn();
    const onOpenDateAdd = vi.fn();
    render(<DateAddSplitButton onAddDay={onAddDay} onOpenDateAdd={onOpenDateAdd} />);

    const group = screen.getByRole("group", { name: "날짜 추가" });
    const primary = screen.getByRole("button", { name: "+ 날짜" });
    const trigger = screen.getByRole("button", { name: "특정 날짜 추가" });
    expect(group).toHaveAttribute("data-slot", "button-group");
    expect(primary).toHaveAttribute("data-variant", "outline");
    expect(trigger).toHaveAttribute("data-variant", "outline");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(primary);
    expect(onAddDay).toHaveBeenCalledOnce();

    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "특정 날짜 선택" }));
    expect(onOpenDateAdd).toHaveBeenCalledOnce();
  });
});
