import type { AttentionItemType } from "./projectOverview";
import type { CommissioningStage } from "./system";

export type StructureKind = "system" | "subsystem";

export type ReadinessBlockerType =
  | "no_assets"
  | "incomplete_asset"
  | "pending_test_item"
  | "failed_test_item"
  | "unsigned_test_record"
  | "critical_issue"
  | "required_document";

export type ReadinessDestinationPage =
  | "Assets"
  | "Checklists & Tests"
  | "Issues"
  | "Documents";

export interface ReadinessBlocker {
  id: string;
  type: ReadinessBlockerType;
  title: string;
  detail: string;
  status: string;
  destinationPage: ReadinessDestinationPage | null;
  attentionType: AttentionItemType | null;
  targetId: string | null;
  matchText: string;
  parentId: string | null;
  parentTitle: string | null;
}

export interface ReadinessStageRecord {
  id: string;
  fromStage: CommissioningStage;
  toStage: CommissioningStage;
  recordedBy: string;
  reason: string;
  forced: boolean;
  blockerCount: number;
  blockers: ReadinessBlocker[];
  createdAt: string;
}

export interface StructureReadinessReview {
  kind: StructureKind;
  structureId: string;
  code: string;
  name: string;
  stage: CommissioningStage;
  blockers: ReadinessBlocker[];
  records: ReadinessStageRecord[];
}

export interface StructureReadinessSummary {
  kind: StructureKind;
  structureId: string;
  code: string;
  name: string;
  stage: CommissioningStage;
  blockerCount: number;
  updatedAt: string;
}

export interface StageTransitionInput {
  targetStage: CommissioningStage;
  recordedBy: string;
  reason: string;
  force: boolean;
}
