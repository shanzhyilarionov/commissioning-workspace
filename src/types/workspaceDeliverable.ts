export const deliverableLabels = {
  required_documents: "Required documents",
  test_records: "Test records",
  subsystem_handover: "Subsystem handover",
} as const;

export type WorkspaceDeliverableKind = keyof typeof deliverableLabels;

interface WorkspaceDeliverableBase {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  context: string;
  parentId: string | null;
  status: string;
}

export type WorkspaceDeliverable = WorkspaceDeliverableBase & (
  | { kind: "required_documents"; revision: string }
  | {
      kind: "test_records" | "subsystem_handover";
      completedCount: number;
      totalCount: number;
    }
);
