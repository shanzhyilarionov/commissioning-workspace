import { describe, expect, it } from "vitest";
import {
  createSuggestedTurnoverPackageNumber,
  getTurnoverFinalEligibility,
} from "./turnoverRules";

describe("getTurnoverFinalEligibility", () => {
  it("allows commissioned scopes without blockers", () => {
    expect(getTurnoverFinalEligibility("commissioned", 0)).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it("allows handed over scopes without blockers", () => {
    expect(getTurnoverFinalEligibility("handed_over", 0)).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it("rejects scopes that have not reached commissioned", () => {
    const result = getTurnoverFinalEligibility("ready", 0);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("must be commissioned");
  });

  it("rejects commissioned scopes with readiness blockers", () => {
    const result = getTurnoverFinalEligibility("commissioned", 2);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("2 readiness blockers remain.");
  });
});

describe("createSuggestedTurnoverPackageNumber", () => {
  it("normalizes the scope reference and pads the sequence", () => {
    expect(createSuggestedTurnoverPackageNumber("elec / lv", 3)).toBe(
      "ELEC-LV-TOP-003",
    );
  });

  it("uses a stable fallback and clamps invalid sequences", () => {
    expect(createSuggestedTurnoverPackageNumber("", 0)).toBe(
      "SCOPE-TOP-001",
    );
  });
});
