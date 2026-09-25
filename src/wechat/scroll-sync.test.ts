import { describe, expect, it } from "vitest";
import { mapScrollTop } from "./scroll-sync";

describe("mapScrollTop", () => {
  it("keeps the beginning, middle, and end aligned across different heights", () => {
    expect(mapScrollTop(0, 1200, 3000)).toBe(0);
    expect(mapScrollTop(600, 1200, 3000)).toBe(1500);
    expect(mapScrollTop(1200, 1200, 3000)).toBe(3000);
  });

  it("clamps positions and handles a pane without overflow", () => {
    expect(mapScrollTop(-20, 1200, 3000)).toBe(0);
    expect(mapScrollTop(1300, 1200, 3000)).toBe(3000);
    expect(mapScrollTop(100, 0, 3000)).toBe(0);
    expect(mapScrollTop(100, 1200, 0)).toBe(0);
  });
});
