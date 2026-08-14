export interface ProjectPackageProject {
  originalId: string;
  name: string;
}

export interface ProjectPackageSummary {
  path: string;
  createdAt: string;
  applicationVersion: string;
  schemaVersion: number;
  projects: ProjectPackageProject[];
  fileCount: number;
  totalBytes: number;
}

export interface ProjectPackageInspection extends ProjectPackageSummary {
  compatible: boolean;
}

export interface ImportedProjectSummary {
  originalId: string;
  id: string;
  name: string;
}

export interface ProjectPackageImportSummary {
  importedAt: string;
  projects: ImportedProjectSummary[];
  fileCount: number;
  totalBytes: number;
}
