export interface WorkspaceBackupSummary {
  path: string;
  createdAt: string;
  applicationVersion: string;
  schemaVersion: number;
  fileCount: number;
  totalBytes: number;
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
