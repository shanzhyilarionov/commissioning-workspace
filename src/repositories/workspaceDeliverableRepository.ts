import { getDatabase } from "../services/database";
import type {
  WorkspaceDeliverable,
  WorkspaceDeliverableKind,
} from "../types/workspaceDeliverable";

interface DeliverableRow {
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  context: string | null;
  parent_id: string | null;
  status: string;
  revision: string | null;
  completed_count: number | null;
  total_count: number | null;
}

const deliverableQueries: Record<WorkspaceDeliverableKind, string> = {
  required_documents: `
    SELECT documents.id, documents.project_id, projects.name AS project_name,
      documents.title, assets.tag AS context, NULL AS parent_id, documents.status,
      documents.revision, NULL AS completed_count, NULL AS total_count
    FROM project_documents AS documents
    INNER JOIN projects ON projects.id = documents.project_id
    LEFT JOIN assets ON assets.id = documents.asset_id
    WHERE documents.required_for_readiness = 1
    ORDER BY projects.name COLLATE NOCASE, documents.title COLLATE NOCASE, documents.id
  `,
  test_records: `
    SELECT records.id, records.project_id, projects.name AS project_name,
      records.title, assets.tag AS context, NULL AS parent_id,
      CASE WHEN records.signed_off_at IS NOT NULL AND TRIM(records.signed_off_at) <> ''
        THEN 'signed_off' ELSE 'unsigned' END AS status,
      NULL AS revision,
      COALESCE(progress.completed_count, 0) AS completed_count,
      COALESCE(progress.total_count, 0) AS total_count
    FROM test_records AS records
    INNER JOIN projects ON projects.id = records.project_id
    LEFT JOIN assets ON assets.id = records.asset_id
    LEFT JOIN (
      SELECT test_record_id, COUNT(*) AS total_count,
        SUM(CASE WHEN result <> 'pending' THEN 1 ELSE 0 END) AS completed_count
      FROM test_items
      GROUP BY test_record_id
    ) AS progress ON progress.test_record_id = records.id
    ORDER BY projects.name COLLATE NOCASE, records.title COLLATE NOCASE, records.id
  `,
  subsystem_handover: `
    SELECT subsystems.id, systems.project_id, projects.name AS project_name,
      subsystems.code || ' - ' || subsystems.name AS title,
      systems.code || ' - ' || systems.name AS context,
      systems.id AS parent_id,
      subsystems.commissioning_stage AS status, NULL AS revision,
      COALESCE(progress.completed_count, 0) AS completed_count,
      COALESCE(progress.total_count, 0) AS total_count
    FROM subsystems
    INNER JOIN systems ON systems.id = subsystems.system_id
    INNER JOIN projects ON projects.id = systems.project_id
    LEFT JOIN (
      SELECT subsystem_id, COUNT(*) AS total_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count
      FROM assets
      GROUP BY subsystem_id
    ) AS progress ON progress.subsystem_id = subsystems.id
    ORDER BY projects.name COLLATE NOCASE, systems.code COLLATE NOCASE,
      subsystems.code COLLATE NOCASE, subsystems.id
  `,
};

export async function listWorkspaceDeliverables(
  kind: WorkspaceDeliverableKind,
): Promise<WorkspaceDeliverable[]> {
  const database = await getDatabase();
  const rows = await database.select<DeliverableRow[]>(deliverableQueries[kind]);

  return rows.map<WorkspaceDeliverable>((row) => {
    const item = {
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      title: row.title,
      context: row.context ?? "",
      parentId: row.parent_id,
      status: row.status,
    };

    return kind === "required_documents"
      ? { ...item, kind, revision: row.revision ?? "" }
      : {
          ...item,
          kind,
          completedCount: Number(row.completed_count ?? 0),
          totalCount: Number(row.total_count ?? 0),
        };
  });
}
