export interface CommissioningSystem {
  id: string;
  projectId: string;
  code: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Subsystem {
  id: string;
  systemId: string;
  code: string;
  name: string;
  description: string;
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
