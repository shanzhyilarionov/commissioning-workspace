export type AttentionItemType =
  | "overdue_issue"
  | "critical_issue"
  | "failed_test_item"
  | "pending_test_item"
  | "unsigned_test_record"
  | "blocked_asset"
  | "incomplete_asset"
  | "required_document"
  | "system_readiness";

export interface ProjectOverviewAssets {
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  blocked: number;
}

export interface ProjectOverviewTestRecords {
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  blocked: number;
}

export interface ProjectOverviewTestItems {
  total: number;
  pending: number;
  passed: number;
  failed: number;
  notApplicable: number;
  completed: number;
  completionPercent: number;
}

export interface ProjectOverviewIssues {
  total: number;
  active: number;
  open: number;
  inProgress: number;
  critical: number;
  high: number;
  overdue: number;
  resolved: number;
  closed: number;
}

export interface ProjectOverviewScopeStages {
  total: number;
  notStarted: number;
  inProgress: number;
  ready: number;
  commissioned: number;
  handedOver: number;
  blocked: number;
}

export interface ProjectOverviewDeliverables {
  requiredDocumentsTotal: number;
  requiredDocumentsApproved: number;
  testRecordsTotal: number;
  testRecordsSigned: number;
  subsystemsTotal: number;
  subsystemsHandedOver: number;
  turnoverPackagesTotal: number;
  turnoverPackagesFinal: number;
}

export interface ProjectOverviewDeadlines {
  dueSoon: number;
  overdue: number;
  noDueDate: number;
  unassigned: number;
}

export interface ProjectOverviewCoverage {
  assetsWithoutTestRecords: number;
  testRecordsWithoutItems: number;
  systemsWithoutAssets: number;
  subsystemsWithoutAssets: number;
}

export interface ProjectOverviewRecentActivity {
  created: number;
  closedOut: number;
  netChange: number;
}

export interface ProjectAttentionItem {
  id: string;
  type: AttentionItemType;
  title: string;
  detail: string;
  status: string;
  updatedAt: string;
  matchText: string;
  parentId: string | null;
  parentTitle: string | null;
}

export interface ProjectOverview {
  assets: ProjectOverviewAssets;
  testRecords: ProjectOverviewTestRecords;
  testItems: ProjectOverviewTestItems;
  issues: ProjectOverviewIssues;
  scope: {
    systems: ProjectOverviewScopeStages;
    subsystems: ProjectOverviewScopeStages;
  };
  deliverables: ProjectOverviewDeliverables;
  deadlines: ProjectOverviewDeadlines;
  coverage: ProjectOverviewCoverage;
  recentActivity: ProjectOverviewRecentActivity;
  attentionItems: ProjectAttentionItem[];
}
