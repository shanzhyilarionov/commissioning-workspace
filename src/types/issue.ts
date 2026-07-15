export type IssuePriority =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type IssueStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "closed";

export interface Issue {
  id: string;
  projectId: string;
  assetId: string | null;
  assetTag: string | null;
  assetName: string | null;
  title: string;
  description: string;
  priority: IssuePriority;
  status: IssueStatus;
  owner: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueInput {
  assetId: string | null;
  title: string;
  description: string;
  priority: IssuePriority;
  status: IssueStatus;
  owner: string;
  dueDate: string | null;
}