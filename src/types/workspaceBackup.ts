export interface WorkspaceBackupSummary {
  path: string;
  createdAt: string;
  applicationVersion: string;
  schemaVersion: number;
  fileCount: number;
  totalBytes: number;
}

export type AutomaticBackupFrequency = "daily" | "weekly";

export interface AutomaticBackupPreferences {
  enabled: boolean;
  frequency: AutomaticBackupFrequency;
  retentionCount: number;
}

export interface AutomaticBackupStatus {
  lastBackup: WorkspaceBackupSummary | null;
  created: boolean;
}

export interface WorkspaceBackupInspection {
  path: string;
  createdAt: string;
  applicationVersion: string;
  schemaVersion: number;
  fileCount: number;
  totalBytes: number;
  compatible: boolean;
}

export interface WorkspaceRestoreSummary {
  restoredFrom: string;
  safetyBackupPath: string;
  restoredAt: string;
  fileCount: number;
  totalBytes: number;
}
