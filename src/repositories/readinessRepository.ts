import { getDatabase } from "../services/database";
import {
  clearAuditOperationContext,
  setAuditOperationContext,
} from "./auditRepository";
import type {
  ReadinessBlocker,
  ReadinessStageRecord,
  StageTransitionInput,
  StructureKind,
  StructureReadinessReview,
  StructureReadinessSummary,
} from "../types/readiness";
import type { CommissioningStage } from "../types/system";

interface StructureRow {
  id: string;
  code: string;
  name: string;
  commissioning_stage: CommissioningStage;
}

interface AssetBlockerRow {
  id: string;
  tag: string;
  name: string;
  status: string;
}

interface TestItemBlockerRow {
  id: string;
  description: string;
  result: "pending" | "fail";
  record_id: string;
  record_title: string;
  asset_tag: string | null;
}

interface TestRecordBlockerRow {
  id: string;
  title: string;
  record_type: string;
  asset_tag: string | null;
}

interface IssueBlockerRow {
  id: string;
  title: string;
  status: string;
  asset_tag: string | null;
}

interface DocumentBlockerRow {
  id: string;
  title: string;
  status: string;
  asset_tag: string | null;
}

interface StageRecordRow {
  id: string;
  from_stage: CommissioningStage;
  to_stage: CommissioningStage;
  recorded_by: string;
  reason: string;
  is_forced: number;
  blocker_count: number;
  blockers_json: string;
  created_at: string;
}

interface SummaryRow {
  structure_kind: StructureKind;
  structure_id: string;
  code: string;
  name: string;
  commissioning_stage: CommissioningStage;
  blocker_count: number;
  updated_at: string;
}

const nextStage: Record<CommissioningStage, CommissioningStage | null> = {
  not_started: "in_progress",
  in_progress: "ready",
  ready: "commissioned",
  commissioned: "handed_over",
  handed_over: null,
};

function scopeColumn(kind: StructureKind): "system_id" | "subsystem_id" {
  return kind === "system" ? "system_id" : "subsystem_id";
}

function formatStatus(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseBlockers(value: string): ReadinessBlocker[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as ReadinessBlocker[]) : [];
  } catch {
    return [];
  }
}

async function getStructure(
  kind: StructureKind,
  structureId: string,
): Promise<StructureRow> {
  const database = await getDatabase();
  const table = kind === "system" ? "systems" : "subsystems";
  const rows = await database.select<StructureRow[]>(
    `
      SELECT id, code, name, commissioning_stage
      FROM ${table}
      WHERE id = $1
      LIMIT 1
    `,
    [structureId],
  );

  const row = rows[0];

  if (!row) {
    throw new Error(`${kind === "system" ? "System" : "Subsystem"} not found.`);
  }

  return row;
}

async function getReadinessBlockers(
  kind: StructureKind,
  structureId: string,
): Promise<ReadinessBlocker[]> {
  const database = await getDatabase();
  const column = scopeColumn(kind);

  const [assetRows, testItemRows, testRecordRows, issueRows, documentRows] =
    await Promise.all([
      database.select<AssetBlockerRow[]>(
        `
          SELECT id, tag, name, status
          FROM assets
          WHERE ${column} = $1
            AND status <> 'completed'
          ORDER BY tag COLLATE NOCASE
        `,
        [structureId],
      ),
      database.select<TestItemBlockerRow[]>(
        `
          SELECT
            test_items.id,
            test_items.description,
            test_items.result,
            test_records.id AS record_id,
            test_records.title AS record_title,
            assets.tag AS asset_tag
          FROM test_items
          INNER JOIN test_records
            ON test_records.id = test_items.test_record_id
          INNER JOIN assets
            ON assets.id = test_records.asset_id
          WHERE assets.${column} = $1
            AND test_items.result IN ('pending', 'fail')
          ORDER BY test_records.title COLLATE NOCASE, test_items.sort_order
        `,
        [structureId],
      ),
      database.select<TestRecordBlockerRow[]>(
        `
          SELECT
            test_records.id,
            test_records.title,
            test_records.record_type,
            assets.tag AS asset_tag
          FROM test_records
          INNER JOIN assets
            ON assets.id = test_records.asset_id
          WHERE assets.${column} = $1
            AND test_records.signed_off_at IS NULL
          ORDER BY test_records.title COLLATE NOCASE
        `,
        [structureId],
      ),
      database.select<IssueBlockerRow[]>(
        `
          SELECT
            issues.id,
            issues.title,
            issues.status,
            assets.tag AS asset_tag
          FROM issues
          INNER JOIN assets
            ON assets.id = issues.asset_id
          WHERE assets.${column} = $1
            AND issues.priority = 'critical'
            AND issues.status IN ('open', 'in_progress')
          ORDER BY issues.updated_at DESC
        `,
        [structureId],
      ),
      database.select<DocumentBlockerRow[]>(
        `
          SELECT
            project_documents.id,
            project_documents.title,
            project_documents.status,
            assets.tag AS asset_tag
          FROM project_documents
          INNER JOIN assets
            ON assets.id = project_documents.asset_id
          WHERE assets.${column} = $1
            AND project_documents.required_for_readiness = 1
            AND project_documents.status <> 'approved'
          ORDER BY project_documents.title COLLATE NOCASE
        `,
        [structureId],
      ),
    ]);

  const blockers: ReadinessBlocker[] = [];

  if (assetRows.length === 0) {
    const assetCountRows = await database.select<{ asset_count: number }[]>(
      `SELECT COUNT(*) AS asset_count FROM assets WHERE ${column} = $1`,
      [structureId],
    );

    if (Number(assetCountRows[0]?.asset_count ?? 0) === 0) {
      blockers.push({
        id: "no-assets",
        type: "no_assets",
        title: "No assets assigned",
        detail: `Assign at least one asset to this ${kind}.`,
        status: "missing",
        destinationPage: "Assets",
        attentionType: null,
        targetId: null,
        matchText: "",
        parentId: null,
        parentTitle: null,
      });
    }
  }

  blockers.push(
    ...assetRows.map<ReadinessBlocker>((row) => ({
      id: `asset-${row.id}`,
      type: "incomplete_asset",
      title: `${row.tag} - ${row.name}`,
      detail: `Asset is ${formatStatus(row.status).toLowerCase()}.`,
      status: row.status,
      destinationPage: "Assets",
      attentionType: "incomplete_asset",
      targetId: row.id,
      matchText: row.tag,
      parentId: null,
      parentTitle: null,
    })),
    ...testItemRows.map<ReadinessBlocker>((row) => ({
      id: `test-item-${row.id}`,
      type:
        row.result === "fail" ? "failed_test_item" : "pending_test_item",
      title: row.description,
      detail: `${row.asset_tag ? `${row.asset_tag} · ` : ""}${row.record_title}`,
      status: row.result,
      destinationPage: "Checklists & Tests",
      attentionType:
        row.result === "fail" ? "failed_test_item" : "pending_test_item",
      targetId: row.id,
      matchText: row.description,
      parentId: row.record_id,
      parentTitle: row.record_title,
    })),
    ...testRecordRows.map<ReadinessBlocker>((row) => ({
      id: `test-record-${row.id}`,
      type: "unsigned_test_record",
      title: row.title,
      detail: `${row.asset_tag ? `${row.asset_tag} · ` : ""}${formatStatus(row.record_type)} is not signed off.`,
      status: "pending",
      destinationPage: "Checklists & Tests",
      attentionType: "unsigned_test_record",
      targetId: row.id,
      matchText: row.title,
      parentId: null,
      parentTitle: null,
    })),
    ...issueRows.map<ReadinessBlocker>((row) => ({
      id: `issue-${row.id}`,
      type: "critical_issue",
      title: row.title,
      detail: `${row.asset_tag ? `${row.asset_tag} · ` : ""}Critical issue is still active.`,
      status: row.status,
      destinationPage: "Issues",
      attentionType: "critical_issue",
      targetId: row.id,
      matchText: row.title,
      parentId: null,
      parentTitle: null,
    })),
    ...documentRows.map<ReadinessBlocker>((row) => ({
      id: `document-${row.id}`,
      type: "required_document",
      title: row.title,
      detail: `${row.asset_tag ? `${row.asset_tag} · ` : ""}Required document is ${formatStatus(row.status).toLowerCase()}.`,
      status: row.status,
      destinationPage: "Documents",
      attentionType: "required_document",
      targetId: row.id,
      matchText: row.title,
      parentId: null,
      parentTitle: null,
    })),
  );

  return blockers;
}

async function listStageRecords(
  kind: StructureKind,
  structureId: string,
): Promise<ReadinessStageRecord[]> {
  const database = await getDatabase();
  const column = kind === "system" ? "system_id" : "subsystem_id";
  const rows = await database.select<StageRecordRow[]>(
    `
      SELECT
        id,
        from_stage,
        to_stage,
        recorded_by,
        reason,
        is_forced,
        blocker_count,
        blockers_json,
        created_at
      FROM readiness_stage_records
      WHERE ${column} = $1
      ORDER BY created_at DESC
    `,
    [structureId],
  );

  return rows.map((row) => ({
    id: row.id,
    fromStage: row.from_stage,
    toStage: row.to_stage,
    recordedBy: row.recorded_by,
    reason: row.reason,
    forced: row.is_forced === 1,
    blockerCount: Number(row.blocker_count),
    blockers: parseBlockers(row.blockers_json),
    createdAt: row.created_at,
  }));
}

export function getNextCommissioningStage(
  stage: CommissioningStage,
): CommissioningStage | null {
  return nextStage[stage];
}

export async function getStructureReadinessReview(
  kind: StructureKind,
  structureId: string,
): Promise<StructureReadinessReview> {
  const [structure, blockers, records] = await Promise.all([
    getStructure(kind, structureId),
    getReadinessBlockers(kind, structureId),
    listStageRecords(kind, structureId),
  ]);

  return {
    kind,
    structureId,
    code: structure.code,
    name: structure.name,
    stage: structure.commissioning_stage,
    blockers,
    records,
  };
}

export async function listStructureReadinessSummaries(
  projectId: string,
): Promise<StructureReadinessSummary[]> {
  const database = await getDatabase();
  const rows = await database.select<SummaryRow[]>(
    `
      SELECT
        'system' AS structure_kind,
        systems.id AS structure_id,
        systems.code,
        systems.name,
        systems.commissioning_stage,
        systems.updated_at,
        (
          CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM assets WHERE assets.system_id = systems.id
            ) THEN 1 ELSE 0
          END
          + (SELECT COUNT(*) FROM assets
             WHERE assets.system_id = systems.id
               AND assets.status <> 'completed')
          + (SELECT COUNT(*) FROM test_items
             INNER JOIN test_records
               ON test_records.id = test_items.test_record_id
             INNER JOIN assets
               ON assets.id = test_records.asset_id
             WHERE assets.system_id = systems.id
               AND test_items.result IN ('pending', 'fail'))
          + (SELECT COUNT(*) FROM test_records
             INNER JOIN assets
               ON assets.id = test_records.asset_id
             WHERE assets.system_id = systems.id
               AND test_records.signed_off_at IS NULL)
          + (SELECT COUNT(*) FROM issues
             INNER JOIN assets
               ON assets.id = issues.asset_id
             WHERE assets.system_id = systems.id
               AND issues.priority = 'critical'
               AND issues.status IN ('open', 'in_progress'))
          + (SELECT COUNT(*) FROM project_documents
             INNER JOIN assets
               ON assets.id = project_documents.asset_id
             WHERE assets.system_id = systems.id
               AND project_documents.required_for_readiness = 1
               AND project_documents.status <> 'approved')
        ) AS blocker_count
      FROM systems
      WHERE systems.project_id = $1

      UNION ALL

      SELECT
        'subsystem' AS structure_kind,
        subsystems.id AS structure_id,
        subsystems.code,
        subsystems.name,
        subsystems.commissioning_stage,
        subsystems.updated_at,
        (
          CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM assets WHERE assets.subsystem_id = subsystems.id
            ) THEN 1 ELSE 0
          END
          + (SELECT COUNT(*) FROM assets
             WHERE assets.subsystem_id = subsystems.id
               AND assets.status <> 'completed')
          + (SELECT COUNT(*) FROM test_items
             INNER JOIN test_records
               ON test_records.id = test_items.test_record_id
             INNER JOIN assets
               ON assets.id = test_records.asset_id
             WHERE assets.subsystem_id = subsystems.id
               AND test_items.result IN ('pending', 'fail'))
          + (SELECT COUNT(*) FROM test_records
             INNER JOIN assets
               ON assets.id = test_records.asset_id
             WHERE assets.subsystem_id = subsystems.id
               AND test_records.signed_off_at IS NULL)
          + (SELECT COUNT(*) FROM issues
             INNER JOIN assets
               ON assets.id = issues.asset_id
             WHERE assets.subsystem_id = subsystems.id
               AND issues.priority = 'critical'
               AND issues.status IN ('open', 'in_progress'))
          + (SELECT COUNT(*) FROM project_documents
             INNER JOIN assets
               ON assets.id = project_documents.asset_id
             WHERE assets.subsystem_id = subsystems.id
               AND project_documents.required_for_readiness = 1
               AND project_documents.status <> 'approved')
        ) AS blocker_count
      FROM subsystems
      INNER JOIN systems
        ON systems.id = subsystems.system_id
      WHERE systems.project_id = $1
    `,
    [projectId],
  );

  return rows.map((row) => ({
    kind: row.structure_kind,
    structureId: row.structure_id,
    code: row.code,
    name: row.name,
    stage: row.commissioning_stage,
    blockerCount: Number(row.blocker_count),
    updatedAt: row.updated_at,
  }));
}

export async function transitionStructureStage(
  kind: StructureKind,
  structureId: string,
  input: StageTransitionInput,
): Promise<StructureReadinessReview> {
  const review = await getStructureReadinessReview(kind, structureId);
  const expectedTarget = nextStage[review.stage];
  const recordedBy = input.recordedBy.trim();
  const reason = input.reason.trim();

  if (!expectedTarget) {
    throw new Error("This structure has already been handed over.");
  }

  if (input.targetStage !== expectedTarget) {
    throw new Error("The commissioning stages must be completed in order.");
  }

  if (!recordedBy) {
    throw new Error("Recorded by is required.");
  }

  const readinessRequired = input.targetStage !== "in_progress";
  const hasBlockers = review.blockers.length > 0;

  if (readinessRequired && hasBlockers && !input.force) {
    throw new Error("Resolve all readiness blockers or record a forced transition.");
  }

  if (readinessRequired && hasBlockers && !reason) {
    throw new Error("A reason is required for a forced transition.");
  }

  const database = await getDatabase();
  const table = kind === "system" ? "systems" : "subsystems";
  const timestamp = new Date().toISOString();
  const forced = readinessRequired && hasBlockers && input.force;
  const recordId = crypto.randomUUID();
  const systemId = kind === "system" ? structureId : null;
  const subsystemId = kind === "subsystem" ? structureId : null;

  await database.execute("BEGIN IMMEDIATE");

  try {
    await setAuditOperationContext({
      action: "stage_advanced",
      actor: recordedBy,
      reason,
    });

    const updateResult = await database.execute(
      `
        UPDATE ${table}
        SET commissioning_stage = $1, updated_at = $2
        WHERE id = $3 AND commissioning_stage = $4
      `,
      [input.targetStage, timestamp, structureId, review.stage],
    );

    if (updateResult.rowsAffected !== 1) {
      throw new Error("The commissioning stage changed while it was being reviewed.");
    }

    await database.execute(
      `
        INSERT INTO readiness_stage_records (
          id,
          system_id,
          subsystem_id,
          from_stage,
          to_stage,
          recorded_by,
          reason,
          is_forced,
          blocker_count,
          blockers_json,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        recordId,
        systemId,
        subsystemId,
        review.stage,
        input.targetStage,
        recordedBy,
        reason,
        forced ? 1 : 0,
        review.blockers.length,
        JSON.stringify(review.blockers),
        timestamp,
      ],
    );

    await clearAuditOperationContext();
    await database.execute("COMMIT");
  } catch (error) {
    await database.execute("ROLLBACK");
    throw error;
  }

  return getStructureReadinessReview(kind, structureId);
}
