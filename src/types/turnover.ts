import type { AssetStatus } from "./asset";
import type { DocumentCategory, DocumentStatus } from "./document";
import type { IssuePriority, IssueStatus } from "./issue";
import type { ProjectStatus } from "./project";
import type {
  ReadinessBlocker,
  ReadinessStageRecord,
  StructureKind,
} from "./readiness";
import type { CommissioningStage } from "./system";
import type { AuditEvent } from "./audit";
import type { TestRecordType } from "./testRecord";

export type TurnoverPackageStatus = "draft" | "final" | "void";
export type TurnoverPackageCreationStatus = Exclude<
  TurnoverPackageStatus,
  "void"
>;

export interface TurnoverProjectSnapshot {
  id: string;
  name: string;
  client: string;
  location: string;
  description: string;
  status: ProjectStatus;
}

export interface TurnoverScopeSnapshot {
  kind: StructureKind;
  id: string;
  code: string;
  name: string;
  description: string;
  stage: CommissioningStage;
  parentSystemCode: string;
  parentSystemName: string;
}

export interface TurnoverAssetSnapshot {
  id: string;
  tag: string;
  name: string;
  assetType: string;
  status: AssetStatus;
  systemCode: string;
  systemName: string;
  subsystemCode: string;
  subsystemName: string;
}

export interface TurnoverTestRecordSnapshot {
  id: string;
  assetTag: string;
  title: string;
  recordType: TestRecordType;
  totalItemCount: number;
  passedItemCount: number;
  failedItemCount: number;
  notApplicableItemCount: number;
  executedBy: string;
  witnessedBy: string;
  executionDate: string | null;
  signedOffBy: string;
  signedOffAt: string | null;
  completionNotes: string;
}

export interface TurnoverIssueSnapshot {
  id: string;
  assetTag: string;
  title: string;
  priority: IssuePriority;
  status: IssueStatus;
  owner: string;
  dueDate: string | null;
}

export interface TurnoverDocumentSnapshot {
  id: string;
  assetTag: string;
  title: string;
  category: DocumentCategory;
  revision: string;
  status: DocumentStatus;
  requiredForReadiness: boolean;
  originalFileName: string;
}

export interface TurnoverPackageSnapshot {
  schemaVersion: 1 | 2;
  generatedAt: string;
  project: TurnoverProjectSnapshot;
  scope: TurnoverScopeSnapshot;
  readiness: {
    blockers: ReadinessBlocker[];
    stageRecords: ReadinessStageRecord[];
  };
  assets: TurnoverAssetSnapshot[];
  testRecords: TurnoverTestRecordSnapshot[];
  issues: TurnoverIssueSnapshot[];
  documents: TurnoverDocumentSnapshot[];
  auditEvents?: AuditEvent[];
}

export interface TurnoverPackageSummary {
  id: string;
  projectId: string;
  scopeKind: StructureKind;
  scopeId: string;
  scopeCode: string;
  scopeName: string;
  packageNumber: string;
  revision: string;
  status: TurnoverPackageStatus;
  stageAtGeneration: CommissioningStage;
  blockerCount: number;
  forcedTransitionCount: number;
  preparedBy: string;
  approvedBy: string;
  notes: string;
  generatedAt: string;
  voidedAt: string | null;
  voidReason: string;
}

export interface TurnoverPackage extends TurnoverPackageSummary {
  snapshot: TurnoverPackageSnapshot;
}

export interface CreateTurnoverPackageInput {
  scopeKind: StructureKind;
  scopeId: string;
  packageNumber: string;
  revision: string;
  status: TurnoverPackageCreationStatus;
  preparedBy: string;
  approvedBy: string;
  notes: string;
}

export interface TurnoverPackagePreflight {
  scope: TurnoverScopeSnapshot;
  blockerCount: number;
  forcedTransitionCount: number;
  assetCount: number;
  testRecordCount: number;
  issueCount: number;
  documentCount: number;
  eligibleForFinal: boolean;
  finalEligibilityReason: string | null;
  suggestedPackageNumber: string;
}
