import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpotForm } from "../src/components/SpotForm";

vi.mock("../src/components/PlaceAutocompleteInput", () => ({
  PlaceAutocompleteInput: ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) => (
    <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  ),
}));

vi.mock("../src/components/MarkdownEditor", () => ({
  MarkdownEditor: ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) => (
    <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  ),
}));

describe("coordinate spot form", () => {
  it("keeps a zero-valued arbitrary coordinate while the user names it", () => {
    const onSubmit = vi.fn();
    render(<SpotForm initialLocation={{ lat: 0, lng: 0 }} onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("0.00000, 0.00000");
    fireEvent.change(screen.getByPlaceholderText(/장소 이름/), { target: { value: "Null Island meeting point" } });
    fireEvent.click(screen.getByRole("button", { name: "스팟 추가" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: "Null Island meeting point",
      placeId: undefined,
      lat: 0,
      lng: 0,
    }));
  });

  it("preserves an arbitrary coordinate when its name is edited", () => {
    const onSubmit = vi.fn();
    render(
      <SpotForm
        initial={{ name: "공터", lat: 37.50123, lng: 127.03987 }}
        submitLabel="저장"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/장소 이름/), { target: { value: "강남역 만남 장소" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: "강남역 만남 장소",
      placeId: undefined,
      lat: 37.50123,
      lng: 127.03987,
    }));
  });

  it("does not invent zero coordinates for a legacy Place ID", () => {
    const onSubmit = vi.fn();
    render(
      <SpotForm
        initial={{ name: "Legacy place", placeId: "place-legacy" }}
        submitLabel="저장"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      placeId: "place-legacy",
      lat: undefined,
      lng: undefined,
    }));
  });

  it("prefills a Google place handoff without saving it before confirmation", () => {
    const onSubmit = vi.fn();
    render(
      <SpotForm
        initialPlace={{ name: "도쿄역", placeId: "tokyo-station", lat: 35.6812, lng: 139.7671, category: "기차역" }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText(/장소 이름/)).toHaveValue("도쿄역");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "스팟 추가" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: "도쿄역",
      placeId: "tokyo-station",
      lat: 35.6812,
      lng: 139.7671,
      category: "기차역",
    }));
  });
});
