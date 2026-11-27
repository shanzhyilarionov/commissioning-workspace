import type { AssetStatus } from "./asset";
import type { IssuePriority } from "./issue";

export const workspaceMetricLabels = {
  assets: "Asset completion",
  test_results: "Assessed test pass rate",
  active_issues: "Active issues",
  attention_projects: "Projects requiring attention",
} as const;

export type WorkspaceMetricKind = keyof typeof workspaceMetricLabels;

interface WorkspaceMetricEntryBase {
  id: string;
  projectId: string;
  projectName: string;
}

export interface WorkspaceAssetEntry extends WorkspaceMetricEntryBase {
  kind: "assets";
  tag: string;
  name: string;
  system: string;
  status: AssetStatus;
}

export interface WorkspaceTestResultEntry extends WorkspaceMetricEntryBase {
  kind: "test_results";
  description: string;
  recordId: string;
  recordTitle: string;
  result: "pass" | "fail";
}

export interface WorkspaceIssueEntry extends WorkspaceMetricEntryBase {
  kind: "active_issues";
  title: string;
  priority: IssuePriority;
  status: "open" | "in_progress";
  dueDate: string | null;
  isOverdue: boolean;
}

export interface WorkspaceAttentionProjectEntry
  extends WorkspaceMetricEntryBase {
  kind: "attention_projects";
  criticalIssues: number;
  overdueIssues: number;
  failedTestItems: number;
  blockedAssets: number;
}

export type WorkspaceMetricEntry =
  | WorkspaceAssetEntry
  | WorkspaceTestResultEntry
  | WorkspaceIssueEntry
  | WorkspaceAttentionProjectEntry;

export type WorkspaceMetricEntryOf<Kind extends WorkspaceMetricKind> =
  Extract<WorkspaceMetricEntry, { kind: Kind }>;
