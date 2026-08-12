export type CommissioningStage =
  | "not_started"
  | "in_progress"
  | "ready"
  | "commissioned"
  | "handed_over";

export interface CommissioningSystem {
  id: string;
  projectId: string;
  code: string;
  name: string;
  description: string;
  stage: CommissioningStage;
  createdAt: string;
  updatedAt: string;
}

export interface Subsystem {
  id: string;
  systemId: string;
  code: string;
  name: string;
  description: string;
  stage: CommissioningStage;
  createdAt: string;
  updatedAt: string;
}

export interface StructureInput {
  code: string;
  name: string;
  description: string;
}

export type SystemInput = StructureInput;
export type SubsystemInput = StructureInput;
