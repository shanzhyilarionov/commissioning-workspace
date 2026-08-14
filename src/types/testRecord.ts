import type { IssueStatus } from "./issue";

export type TestRecordType =
  | "checklist"
  | "functional_test";

export type TestRecordStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "blocked";

export type TestItemResult =
  | "pending"
  | "pass"
  | "fail"
  | "not_applicable";

export interface TestRecord {
  id: string;
  projectId: string;
  assetId: string | null;
  assetTag: string | null;
  assetName: string | null;
  title: string;
  recordType: TestRecordType;
  description: string;
  status: TestRecordStatus;
  completedItemCount: number;
  failedItemCount: number;
  totalItemCount: number;
  executedBy: string;
  witnessedBy: string;
  executionDate: string | null;
  signedOffBy: string;
  signedOffAt: string | null;
  completionNotes: string;
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TestRecordInput {
  assetId: string | null;
  title: string;
  recordType: TestRecordType;
  description: string;
}

export interface TestRecordCompletionInput {
  executedBy: string;
  witnessedBy: string;
  executionDate: string;
  signedOffBy: string;
  completionNotes: string;
}

export interface TestRecordReopenInput {
  reopenedBy: string;
  reason: string;
}

export interface TestRecordRevision {
  id: string;
  testRecordId: string;
  revisionNumber: number;
  signedOffBy: string;
  signedOffAt: string;
  reopenedBy: string;
  reopenReason: string;
  createdAt: string;
}

export interface TestItem {
  id: string;
  testRecordId: string;
  description: string;
  acceptanceCriteria: string;
  result: TestItemResult;
  notes: string;
  sortOrder: number;
  linkedIssueId: string | null;
  linkedIssueStatus: IssueStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestItemInput {
  description: string;
  acceptanceCriteria: string;
  result: TestItemResult;
  notes: string;
  sortOrder: number;
}
