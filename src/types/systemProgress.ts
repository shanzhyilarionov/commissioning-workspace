export type CommissioningReadiness =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "ready";

export interface StructureProgress {
  structureId: string | null;
  assetTotal: number;
  assetInProgress: number;
  assetCompleted: number;
  assetBlocked: number;
  testRecordTotal: number;
  testRecordCompleted: number;
  testItemTotal: number;
  testItemCompleted: number;
  testItemFailed: number;
  activeIssueTotal: number;
  criticalIssueTotal: number;
  completionPercent: number;
  readiness: CommissioningReadiness;
}

export interface ProjectStructureProgress {
  systems: StructureProgress[];
  subsystems: StructureProgress[];
  unassigned: StructureProgress;
}
