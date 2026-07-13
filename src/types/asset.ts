export type AssetStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "blocked";

export interface Asset {
  id: string;
  projectId: string;
  systemName: string;
  tag: string;
  name: string;
  assetType: string;
  status: AssetStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetInput {
  systemName: string;
  tag: string;
  name: string;
  assetType: string;
  status: AssetStatus;
  description: string;
}