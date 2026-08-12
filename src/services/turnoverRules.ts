import type { CommissioningStage } from "../types/system";

export interface TurnoverFinalEligibility {
  eligible: boolean;
  reason: string | null;
}

export function getTurnoverFinalEligibility(
  stage: CommissioningStage,
  blockerCount: number,
): TurnoverFinalEligibility {
  if (stage !== "commissioned" && stage !== "handed_over") {
    return {
      eligible: false,
      reason: "The scope must be commissioned before a final package can be created.",
    };
  }

  if (blockerCount > 0) {
    return {
      eligible: false,
      reason: `${blockerCount} readiness blocker${blockerCount === 1 ? " remains" : "s remain"}.`,
    };
  }

  return {
    eligible: true,
    reason: null,
  };
}

export function createSuggestedTurnoverPackageNumber(
  scopeReference: string,
  sequence: number,
): string {
  const normalizedReference = scopeReference
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const normalizedSequence = Math.max(1, Math.trunc(sequence));

  return `${normalizedReference || "SCOPE"}-TOP-${String(normalizedSequence).padStart(3, "0")}`;
}
