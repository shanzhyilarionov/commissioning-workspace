export interface WorkspaceAssetAnalytics {
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  blocked: number;
}

export interface WorkspaceTestAnalytics {
  total: number;
  pending: number;
  passed: number;
  failed: number;
  notApplicable: number;
  assessed: number;
  passRate: number;
}

export interface WorkspaceIssueAnalytics {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  active: number;
  critical: number;
  overdue: number;
}

export interface WorkspaceRecentActivity {
  created: number;
  updated: number;
  closedOut: number;
}

export interface WorkspaceProjectAttentionAnalytics {
  total: number;
  critical: number;
  overdue: number;
}

export interface WorkspaceDeliverableAnalytics {
  requiredDocumentsTotal: number;
  requiredDocumentsApproved: number;
  testRecordsTotal: number;
  testRecordsSigned: number;
  handoverSubsystemsTotal: number;
  handoverSubsystemsComplete: number;
}

export interface WorkspaceWeeklyActivity {
  startDate: string;
  label: string;
  created: number;
  closedOut: number;
}

export interface WorkspaceDailyActivity {
  startDate: string;
  label: string;
  created: number;
  closedOut: number;
}

export interface WorkspaceAnalytics {
  assets: WorkspaceAssetAnalytics;
  tests: WorkspaceTestAnalytics;
  issues: WorkspaceIssueAnalytics;
  projectsRequiringAttention: WorkspaceProjectAttentionAnalytics;
  deliverables: WorkspaceDeliverableAnalytics;
  recentActivity: WorkspaceRecentActivity;
  weeklyActivity: WorkspaceWeeklyActivity[];
  dailyActivity: WorkspaceDailyActivity[];
}
