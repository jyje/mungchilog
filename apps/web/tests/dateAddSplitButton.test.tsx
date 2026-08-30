import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateAddSplitButton } from "../src/components/system/DateAddSplitButton";

describe("DateAddSplitButton", () => {
  it("keeps the default and custom date actions in one connected button group", async () => {
    const onAddDay = vi.fn();
    const onOpenDateAdd = vi.fn();
    render(<DateAddSplitButton onAddDay={onAddDay} onOpenDateAdd={onOpenDateAdd} />);

    const group = screen.getByRole("group", { name: "날짜 추가" });
    expect(group).toHaveClass("date-add-split-group");
    expect(screen.getByRole("button", { name: "+ 날짜" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "특정 날짜 추가" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "+ 날짜" }));
    expect(onAddDay).toHaveBeenCalledOnce();

    fireEvent.pointerDown(screen.getByRole("button", { name: "특정 날짜 추가" }), { button: 0 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "특정 날짜 선택" }));
    expect(onOpenDateAdd).toHaveBeenCalledOnce();
  });
});
