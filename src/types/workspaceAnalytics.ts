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
  active: number;
  critical: number;
  overdue: number;
}

export interface WorkspaceRecentActivity {
  created: number;
  updated: number;
  closedOut: number;
}

export interface WorkspaceWeeklyActivity {
  startDate: string;
  label: string;
  created: number;
  closedOut: number;
}

export interface WorkspaceAnalytics {
  assets: WorkspaceAssetAnalytics;
  tests: WorkspaceTestAnalytics;
  issues: WorkspaceIssueAnalytics;
  recentActivity: WorkspaceRecentActivity;
  weeklyActivity: WorkspaceWeeklyActivity[];
}
