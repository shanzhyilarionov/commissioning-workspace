import { describe, expect, it } from "vitest";
import { calculateActionMenuPosition } from "./ActionMenu";

describe("calculateActionMenuPosition", () => {
  it("aligns the panel to the trigger without crossing the right edge", () => {
    expect(
      calculateActionMenuPosition(
        { top: 118, right: 287, bottom: 178 },
        { width: 168, height: 96 },
        320,
        500,
      ),
    ).toEqual({ left: 119, top: 184 });
  });

  it("keeps the panel inside the left viewport padding", () => {
    expect(
      calculateActionMenuPosition(
        { top: 40, right: 90, bottom: 70 },
        { width: 168, height: 96 },
        320,
        500,
      ),
    ).toEqual({ left: 8, top: 76 });
  });

  it("opens above the trigger when the bottom space is insufficient", () => {
    expect(
      calculateActionMenuPosition(
        { top: 360, right: 287, bottom: 390 },
        { width: 168, height: 96 },
        320,
        420,
      ),
    ).toEqual({ left: 119, top: 258 });
  });
});
