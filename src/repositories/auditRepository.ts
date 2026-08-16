import { getDatabase } from "../services/database";
import type {
  AuditEntityType,
  AuditEvent,
  AuditOperationContext,
} from "../types/audit";

interface AuditEventRow {
  id: string;
  project_id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  parent_entity_id: string | null;
  action: string;
  entity_label: string;
  actor: string;
  reason: string;
  details_json: string;
  created_at: string;
}

interface SettingRow {
  value: string;
}

function mapAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    parentEntityId: row.parent_entity_id,
    action: row.action,
    entityLabel: row.entity_label,
    actor: row.actor,
    reason: row.reason,
    detailsJson: row.details_json,
    createdAt: row.created_at,
  };
}

export async function getCurrentOperator(): Promise<string> {
  const database = await getDatabase();
  const rows = await database.select<SettingRow[]>(
    `
      SELECT value
      FROM workspace_settings
      WHERE key = 'current_operator'
      LIMIT 1
    `,
  );

  return rows[0]?.value ?? "";
}

export async function setCurrentOperator(
  operatorName: string,
): Promise<string> {
  const normalizedName = operatorName.trim();
  const database = await getDatabase();

  if (!normalizedName) {
    await database.execute(
      `
        DELETE FROM workspace_settings
        WHERE key = 'current_operator'
      `,
    );

    return "";
  }

  const updatedAt = new Date().toISOString();

  await database.execute(
    `
      INSERT INTO workspace_settings (
        key,
        value,
        updated_at
      )
      VALUES ('current_operator', $1, $2)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
    [normalizedName, updatedAt],
  );

  return normalizedName;
}

export async function listAuditEvents(
  projectId: string,
  limit = 12,
): Promise<AuditEvent[]> {
  const normalizedLimit = Math.max(1, Math.min(2000, Math.trunc(limit)));
  const database = await getDatabase();
  const rows = await database.select<AuditEventRow[]>(
    `
      SELECT
        id,
        project_id,
        entity_type,
        entity_id,
        CASE
          WHEN entity_type = 'subsystem' THEN (
            SELECT system_id
            FROM subsystems
            WHERE id = audit_events.entity_id
          )
          WHEN entity_type = 'test_item' THEN
            json_extract(details_json, '$.recordId')
          ELSE NULL
        END AS parent_entity_id,
        action,
        entity_label,
        actor,
        reason,
        details_json,
        created_at
      FROM audit_events
      WHERE project_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [projectId, normalizedLimit],
  );

  return rows.map(mapAuditEvent);
}

export async function setAuditOperationContext(
  context: AuditOperationContext,
): Promise<void> {
  const database = await getDatabase();

  await database.execute(
    `
      INSERT INTO audit_operation_context (
        id,
        enabled,
        action,
        actor,
        reason
      )
      VALUES (1, 1, $1, $2, $3)
      ON CONFLICT(id) DO UPDATE SET
        enabled = 1,
        action = excluded.action,
        actor = excluded.actor,
        reason = excluded.reason
    `,
    [context.action, context.actor.trim(), context.reason.trim()],
  );
}

export async function clearAuditOperationContext(): Promise<void> {
  const database = await getDatabase();

  await database.execute(
    `
      UPDATE audit_operation_context
      SET
        enabled = 1,
        action = '',
        actor = '',
        reason = ''
      WHERE id = 1
    `,
  );
}
