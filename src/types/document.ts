export type DocumentCategory =
  | "drawing"
  | "specification"
  | "datasheet"
  | "manual"
  | "procedure"
  | "certificate"
  | "test_record"
  | "report"
  | "other";

export type DocumentStatus =
  | "draft"
  | "for_review"
  | "approved"
  | "superseded";

export interface ProjectDocument {
  id: string;
  projectId: string;
  assetId: string | null;
  title: string;
  category: DocumentCategory;
  revision: string;
  status: DocumentStatus;
  requiredForReadiness: boolean;
  originalFileName: string;
  storedPath: string;
  mimeType: string;
  fileSize: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDocumentInput {
  assetId: string | null;
  title: string;
  category: DocumentCategory;
  revision: string;
  status: DocumentStatus;
  requiredForReadiness: boolean;
  notes: string;
}

export interface ImportedProjectDocumentFile {
  originalFileName: string;
  storedPath: string;
  mimeType: string;
  fileSize: number;
}
