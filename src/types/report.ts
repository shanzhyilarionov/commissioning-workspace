import type { IssuePriority, IssueStatus } from "./issue";
import type { TestItemResult, TestRecordType } from "./testRecord";

export interface ReportRecordSummary {
  id: string;
  projectId: string;
  assetId: string | null;
  assetTag: string | null;
  assetName: string | null;
  assetSystemName: string | null;
  title: string;
  recordType: TestRecordType;
  description: string;
  totalItemCount: number;
  passedItemCount: number;
  failedItemCount: number;
  notApplicableItemCount: number;
  executedBy: string;
  witnessedBy: string;
  executionDate: string;
  signedOffBy: string;
  signedOffAt: string;
  completionNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportLinkedIssue {
  id: string;
  title: string;
  priority: IssuePriority;
  status: IssueStatus;
  owner: string;
  dueDate: string | null;
}

export interface ReportTestItem {
  id: string;
  testRecordId: string;
  description: string;
  acceptanceCriteria: string;
  result: TestItemResult;
  notes: string;
  sortOrder: number;
  linkedIssue: ReportLinkedIssue | null;
}

export interface TestRecordReportBundle {
  record: ReportRecordSummary;
  items: ReportTestItem[];
}
