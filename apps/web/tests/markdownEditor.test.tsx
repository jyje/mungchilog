import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "../src/components/MarkdownEditor";

describe("markdown editor actions", () => {
  it("exposes edit/read state and save through configured shadcn Buttons", () => {
    const onSave = vi.fn();
    render(<MarkdownEditor value="처음 메모" onSave={onSave} />);

    const read = screen.getByRole("button", { name: "읽기" });
    expect(read).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "편집" }));
    const editor = screen.getByRole("textbox");
    fireEvent.change(editor, { target: { value: "바뀐 메모" } });
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(onSave).toHaveBeenCalledWith("바뀐 메모");
    expect(screen.getByRole("button", { name: "읽기" })).toHaveAttribute("aria-pressed", "true");
  });
});
