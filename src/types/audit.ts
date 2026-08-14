export type AuditEntityType =
  | "project"
  | "system"
  | "subsystem"
  | "asset"
  | "issue"
  | "test_record"
  | "test_item"
  | "document"
  | "turnover_package";

export type AuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "status_changed"
  | "stage_advanced"
  | "result_changed"
  | "signed"
  | "reopened"
  | "finalized"
  | "voided";

export interface AuditEvent {
  id: string;
  projectId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction | string;
  entityLabel: string;
  actor: string;
  reason: string;
  detailsJson: string;
  createdAt: string;
}

export interface AuditOperationContext {
  action: AuditAction | string;
  actor: string;
  reason: string;
}
