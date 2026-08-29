import { describe, expect, it } from "vitest";
import { canAccessGallery } from "./galleryAccess";

describe("canAccessGallery", () => {
  it("allows localhost and the development host in production builds", () => {
    expect(canAccessGallery("localhost", false)).toBe(true);
    expect(canAccessGallery("mungchilog.dev.jyje.online", false)).toBe(true);
  });

  it("does not expose the gallery from staging or production", () => {
    expect(canAccessGallery("mungchilog.stg.jyje.online", false)).toBe(false);
    expect(canAccessGallery("mungchilog.app.jyje.online", false)).toBe(false);
  });

  it("allows Vite development builds regardless of the temporary host", () => {
    expect(canAccessGallery("preview.example.test", true)).toBe(true);
  });
});
