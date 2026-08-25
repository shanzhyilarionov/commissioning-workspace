import { getDatabase } from "../services/database";
import { listStructureReadinessSummaries } from "./readinessRepository";
import type {
  AttentionItemType,
  ProjectAttentionItem,
  ProjectOverview,
} from "../types/projectOverview";

interface ProjectOverviewRow {
  asset_total: number;
  asset_not_started: number;
  asset_in_progress: number;
  asset_completed: number;
  asset_blocked: number;
  test_record_total: number;
  test_record_not_started: number;
  test_record_in_progress: number;
  test_record_completed: number;
  test_record_blocked: number;
  test_item_total: number;
  test_item_pending: number;
  test_item_passed: number;
  test_item_failed: number;
  test_item_not_applicable: number;
  issue_total: number;
  issue_active: number;
  issue_open: number;
  issue_in_progress: number;
  issue_critical: number;
  issue_high: number;
  issue_overdue: number;
  issue_resolved: number;
  issue_closed: number;
  system_total: number;
  system_not_started: number;
  system_in_progress: number;
  system_ready: number;
  system_commissioned: number;
  system_handed_over: number;
  subsystem_total: number;
  subsystem_not_started: number;
  subsystem_in_progress: number;
  subsystem_ready: number;
  subsystem_commissioned: number;
  subsystem_handed_over: number;
  required_document_total: number;
  required_document_approved: number;
  test_record_signed: number;
  turnover_package_total: number;
  turnover_package_final: number;
  issue_due_soon: number;
  issue_no_due_date: number;
  issue_unassigned: number;
  assets_without_test_records: number;
  test_records_without_items: number;
  systems_without_assets: number;
  subsystems_without_assets: number;
}

interface ProjectAttentionItemRow {
  id: string;
  attention_type: AttentionItemType;
  title: string;
  detail: string;
  status: string;
  updated_at: string;
  sort_priority: number;
  match_text: string;
  parent_id: string | null;
  parent_title: string | null;
}

interface ProjectActivityEventRow {
  action: string;
  details_json: string;
}

function toNumber(value: number | null | undefined): number {
  return Number(value ?? 0);
}

function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDetails(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readNestedValue(
  value: Record<string, unknown>,
  objectKey: string,
  fieldKey: string,
): string {
  const nestedValue = value[objectKey];

  if (!nestedValue || typeof nestedValue !== "object") {
    return "";
  }

  const fieldValue = (nestedValue as Record<string, unknown>)[
    fieldKey
  ];

  return typeof fieldValue === "string" ? fieldValue : "";
}

function isClosedOutEvent(event: ProjectActivityEventRow): boolean {
  if (event.action === "signed" || event.action === "finalized") {
    return true;
  }

  const details = parseDetails(event.details_json);

  if (event.action === "status_changed") {
    const status =
      readNestedValue(details, "after", "status") ||
      (typeof details.afterStatus === "string"
        ? details.afterStatus
        : "");

    return ["completed", "resolved", "closed"].includes(status);
  }

  if (event.action === "result_changed") {
    return ["pass", "not_applicable"].includes(
      readNestedValue(details, "after", "result"),
    );
  }

  return false;
}

function mapAttentionItem(
  row: ProjectAttentionItemRow,
): ProjectAttentionItem {
  return {
    id: row.id,
    type: row.attention_type,
    title: row.title,
    detail: row.detail,
    status: row.status,
    updatedAt: row.updated_at,
    matchText: row.match_text,
    parentId: row.parent_id,
    parentTitle: row.parent_title,
  };
}

export async function getProjectOverview(
  projectId: string,
): Promise<ProjectOverview> {
  const database = await getDatabase();
  const today = getLocalDateString();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const overviewRows = await database.select<ProjectOverviewRow[]>(
    `
      WITH record_progress AS (
        SELECT
          test_records.id,
          COUNT(test_items.id) AS total_item_count,
          COALESCE(
            SUM(
              CASE
                WHEN test_items.result <> 'pending' THEN 1
                ELSE 0
              END
            ),
            0
          ) AS completed_item_count,
          COALESCE(
            SUM(
              CASE
                WHEN test_items.result = 'fail' THEN 1
                ELSE 0
              END
            ),
            0
          ) AS failed_item_count
        FROM test_records
        LEFT JOIN test_items
          ON test_items.test_record_id = test_records.id
        WHERE test_records.project_id = $1
        GROUP BY test_records.id
      ),
      record_statuses AS (
        SELECT
          CASE
            WHEN failed_item_count > 0 THEN 'blocked'
            WHEN total_item_count = 0
              OR completed_item_count = 0 THEN 'not_started'
            WHEN completed_item_count < total_item_count
              THEN 'in_progress'
            ELSE 'completed'
          END AS status
        FROM record_progress
      )
      SELECT
        (
          SELECT COUNT(*)
          FROM assets
          WHERE project_id = $1
        ) AS asset_total,
        (
          SELECT COUNT(*)
          FROM assets
          WHERE project_id = $1
            AND status = 'not_started'
        ) AS asset_not_started,
        (
          SELECT COUNT(*)
          FROM assets
          WHERE project_id = $1
            AND status = 'in_progress'
        ) AS asset_in_progress,
        (
          SELECT COUNT(*)
          FROM assets
          WHERE project_id = $1
            AND status = 'completed'
        ) AS asset_completed,
        (
          SELECT COUNT(*)
          FROM assets
          WHERE project_id = $1
            AND status = 'blocked'
        ) AS asset_blocked,
        (
          SELECT COUNT(*)
          FROM record_statuses
        ) AS test_record_total,
        (
          SELECT COUNT(*)
          FROM record_statuses
          WHERE status = 'not_started'
        ) AS test_record_not_started,
        (
          SELECT COUNT(*)
          FROM record_statuses
          WHERE status = 'in_progress'
        ) AS test_record_in_progress,
        (
          SELECT COUNT(*)
          FROM record_statuses
          WHERE status = 'completed'
        ) AS test_record_completed,
        (
          SELECT COUNT(*)
          FROM record_statuses
          WHERE status = 'blocked'
        ) AS test_record_blocked,
        (
          SELECT COUNT(*)
          FROM test_items
          INNER JOIN test_records
            ON test_records.id = test_items.test_record_id
          WHERE test_records.project_id = $1
        ) AS test_item_total,
        (
          SELECT COUNT(*)
          FROM test_items
          INNER JOIN test_records
            ON test_records.id = test_items.test_record_id
          WHERE test_records.project_id = $1
            AND test_items.result = 'pending'
        ) AS test_item_pending,
        (
          SELECT COUNT(*)
          FROM test_items
          INNER JOIN test_records
            ON test_records.id = test_items.test_record_id
          WHERE test_records.project_id = $1
            AND test_items.result = 'pass'
        ) AS test_item_passed,
        (
          SELECT COUNT(*)
          FROM test_items
          INNER JOIN test_records
            ON test_records.id = test_items.test_record_id
          WHERE test_records.project_id = $1
            AND test_items.result = 'fail'
        ) AS test_item_failed,
        (
          SELECT COUNT(*)
          FROM test_items
          INNER JOIN test_records
            ON test_records.id = test_items.test_record_id
          WHERE test_records.project_id = $1
            AND test_items.result = 'not_applicable'
        ) AS test_item_not_applicable,
        (
          SELECT COUNT(*)
          FROM issues
          WHERE project_id = $1
        ) AS issue_total,
        (
          SELECT COUNT(*)
          FROM issues
          WHERE project_id = $1
            AND status IN ('open', 'in_progress')
        ) AS issue_active,
        (
          SELECT COUNT(*)
          FROM issues
          WHERE project_id = $1
            AND status = 'open'
        ) AS issue_open,
        (
          SELECT COUNT(*)
          FROM issues
          WHERE project_id = $1
            AND status = 'in_progress'
        ) AS issue_in_progress,
        (
          SELECT COUNT(*)
          FROM issues
          WHERE project_id = $1
            AND status IN ('open', 'in_progress')
            AND priority = 'critical'
        ) AS issue_critical,
        (
          SELECT COUNT(*)
          FROM issues
          WHERE project_id = $1
            AND status IN ('open', 'in_progress')
            AND priority = 'high'
        ) AS issue_high,
        (
          SELECT COUNT(*)
          FROM issues
          WHERE project_id = $1
            AND status IN ('open', 'in_progress')
            AND due_date IS NOT NULL
            AND due_date <> ''
            AND date(due_date) < date($2)
        ) AS issue_overdue,
        (
          SELECT COUNT(*)
          FROM issues
          WHERE project_id = $1
            AND status = 'resolved'
        ) AS issue_resolved,
        (
          SELECT COUNT(*)
          FROM issues
          WHERE project_id = $1
            AND status = 'closed'
        ) AS issue_closed,
        (
          SELECT COUNT(*)
          FROM systems
          WHERE project_id = $1
        ) AS system_total,
        (
          SELECT COUNT(*)
          FROM systems
          WHERE project_id = $1
            AND commissioning_stage = 'not_started'
        ) AS system_not_started,
        (
          SELECT COUNT(*)
          FROM systems
          WHERE project_id = $1
            AND commissioning_stage = 'in_progress'
        ) AS system_in_progress,
        (
          SELECT COUNT(*)
          FROM systems
          WHERE project_id = $1
            AND commissioning_stage = 'ready'
        ) AS system_ready,
        (
          SELECT COUNT(*)
          FROM systems
          WHERE project_id = $1
            AND commissioning_stage = 'commissioned'
        ) AS system_commissioned,
        (
          SELECT COUNT(*)
          FROM systems
          WHERE project_id = $1
            AND commissioning_stage = 'handed_over'
        ) AS system_handed_over,
        (
          SELECT COUNT(*)
          FROM subsystems
          INNER JOIN systems
            ON systems.id = subsystems.system_id
          WHERE systems.project_id = $1
        ) AS subsystem_total,
        (
          SELECT COUNT(*)
          FROM subsystems
          INNER JOIN systems
            ON systems.id = subsystems.system_id
          WHERE systems.project_id = $1
            AND subsystems.commissioning_stage = 'not_started'
        ) AS subsystem_not_started,
        (
          SELECT COUNT(*)
          FROM subsystems
          INNER JOIN systems
            ON systems.id = subsystems.system_id
          WHERE systems.project_id = $1
            AND subsystems.commissioning_stage = 'in_progress'
        ) AS subsystem_in_progress,
        (
          SELECT COUNT(*)
          FROM subsystems
          INNER JOIN systems
            ON systems.id = subsystems.system_id
          WHERE systems.project_id = $1
            AND subsystems.commissioning_stage = 'ready'
        ) AS subsystem_ready,
        (
          SELECT COUNT(*)
          FROM subsystems
          INNER JOIN systems
            ON systems.id = subsystems.system_id
          WHERE systems.project_id = $1
            AND subsystems.commissioning_stage = 'commissioned'
        ) AS subsystem_commissioned,
        (
          SELECT COUNT(*)
          FROM subsystems
          INNER JOIN systems
            ON systems.id = subsystems.system_id
          WHERE systems.project_id = $1
            AND subsystems.commissioning_stage = 'handed_over'
        ) AS subsystem_handed_over,
        (
          SELECT COUNT(*)
          FROM project_documents
          WHERE project_id = $1
            AND required_for_readiness = 1
        ) AS required_document_total,
        (
          SELECT COUNT(*)
          FROM project_documents
          WHERE project_id = $1
            AND required_for_readiness = 1
            AND status = 'approved'
        ) AS required_document_approved,
        (
          SELECT COUNT(*)
          FROM test_records
          WHERE project_id = $1
            AND signed_off_at IS NOT NULL
            AND TRIM(signed_off_at) <> ''
        ) AS test_record_signed,
        (
          SELECT COUNT(*)
          FROM turnover_packages
          WHERE project_id = $1
            AND status <> 'void'
        ) AS turnover_package_total,
        (
          SELECT COUNT(*)
          FROM turnover_packages
          WHERE project_id = $1
            AND status = 'final'
        ) AS turnover_package_final,
        (
          SELECT COUNT(*)
          FROM issues
          WHERE project_id = $1
            AND status IN ('open', 'in_progress')
            AND due_date IS NOT NULL
            AND TRIM(due_date) <> ''
            AND DATE(due_date) >= DATE($2)
            AND DATE(due_date) <= DATE($2, '+7 days')
        ) AS issue_due_soon,
        (
          SELECT COUNT(*)
          FROM issues
          WHERE project_id = $1
            AND status IN ('open', 'in_progress')
            AND (due_date IS NULL OR TRIM(due_date) = '')
        ) AS issue_no_due_date,
        (
          SELECT COUNT(*)
          FROM issues
          WHERE project_id = $1
            AND status IN ('open', 'in_progress')
            AND TRIM(owner) = ''
        ) AS issue_unassigned,
        (
          SELECT COUNT(*)
          FROM assets
          WHERE project_id = $1
            AND NOT EXISTS (
              SELECT 1
              FROM test_records
              WHERE test_records.asset_id = assets.id
            )
        ) AS assets_without_test_records,
        (
          SELECT COUNT(*)
          FROM test_records
          WHERE project_id = $1
            AND NOT EXISTS (
              SELECT 1
              FROM test_items
              WHERE test_items.test_record_id = test_records.id
            )
        ) AS test_records_without_items,
        (
          SELECT COUNT(*)
          FROM systems
          WHERE project_id = $1
            AND NOT EXISTS (
              SELECT 1
              FROM assets
              WHERE assets.system_id = systems.id
            )
        ) AS systems_without_assets,
        (
          SELECT COUNT(*)
          FROM subsystems
          INNER JOIN systems
            ON systems.id = subsystems.system_id
          WHERE systems.project_id = $1
            AND NOT EXISTS (
              SELECT 1
              FROM assets
              WHERE assets.subsystem_id = subsystems.id
            )
        ) AS subsystems_without_assets
    `,
    [projectId, today],
  );

  const [attentionRows, readinessSummaries, activityRows] = await Promise.all([
    database.select<ProjectAttentionItemRow[]>(
    `
      SELECT
        id,
        attention_type,
        title,
        detail,
        status,
        updated_at,
        sort_priority,
        match_text,
        parent_id,
        parent_title
      FROM (
        SELECT
          issues.id AS id,
          'overdue_issue' AS attention_type,
          issues.title AS title,
          CASE
            WHEN assets.tag IS NULL THEN
              'Due ' || issues.due_date
            ELSE
              assets.tag || ' · Due ' || issues.due_date
          END AS detail,
          issues.status AS status,
          issues.updated_at AS updated_at,
          1 AS sort_priority,
          issues.title AS match_text,
          NULL AS parent_id,
          NULL AS parent_title
        FROM issues
        LEFT JOIN assets
          ON assets.id = issues.asset_id
        WHERE issues.project_id = $1
          AND issues.status IN ('open', 'in_progress')
          AND issues.due_date IS NOT NULL
          AND issues.due_date <> ''
          AND date(issues.due_date) < date($2)

        UNION ALL

        SELECT
          issues.id AS id,
          'critical_issue' AS attention_type,
          issues.title AS title,
          CASE
            WHEN assets.tag IS NULL THEN
              'Critical issue'
            ELSE
              assets.tag || ' · Critical issue'
          END AS detail,
          issues.status AS status,
          issues.updated_at AS updated_at,
          2 AS sort_priority,
          issues.title AS match_text,
          NULL AS parent_id,
          NULL AS parent_title
        FROM issues
        LEFT JOIN assets
          ON assets.id = issues.asset_id
        WHERE issues.project_id = $1
          AND issues.status IN ('open', 'in_progress')
          AND issues.priority = 'critical'
          AND NOT (
            issues.due_date IS NOT NULL
            AND issues.due_date <> ''
            AND date(issues.due_date) < date($2)
          )

        UNION ALL

        SELECT
          test_items.id AS id,
          'failed_test_item' AS attention_type,
          test_items.description AS title,
          CASE
            WHEN assets.tag IS NULL THEN
              test_records.title
            ELSE
              assets.tag || ' · ' || test_records.title
          END AS detail,
          test_items.result AS status,
          test_items.updated_at AS updated_at,
          3 AS sort_priority,
          test_items.description AS match_text,
          test_records.id AS parent_id,
          test_records.title AS parent_title
        FROM test_items
        INNER JOIN test_records
          ON test_records.id = test_items.test_record_id
        LEFT JOIN assets
          ON assets.id = test_records.asset_id
        WHERE test_records.project_id = $1
          AND test_items.result = 'fail'

        UNION ALL

        SELECT
          test_records.id AS id,
          'unsigned_test_record' AS attention_type,
          test_records.title AS title,
          CASE
            WHEN assets.tag IS NULL THEN
              'All test items assessed'
            ELSE
              assets.tag || ' · All test items assessed'
          END AS detail,
          'unsigned' AS status,
          test_records.updated_at AS updated_at,
          4 AS sort_priority,
          test_records.title AS match_text,
          NULL AS parent_id,
          NULL AS parent_title
        FROM test_records
        LEFT JOIN assets
          ON assets.id = test_records.asset_id
        WHERE test_records.project_id = $1
          AND test_records.signed_off_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM test_items
            WHERE test_items.test_record_id = test_records.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM test_items
            WHERE test_items.test_record_id = test_records.id
              AND test_items.result IN ('pending', 'fail')
          )

        UNION ALL

        SELECT
          project_documents.id AS id,
          'required_document' AS attention_type,
          project_documents.title AS title,
          CASE
            WHEN assets.tag IS NULL THEN
              'Required for readiness'
            ELSE
              assets.tag || ' · Required for readiness'
          END AS detail,
          project_documents.status AS status,
          project_documents.updated_at AS updated_at,
          5 AS sort_priority,
          project_documents.title AS match_text,
          NULL AS parent_id,
          NULL AS parent_title
        FROM project_documents
        LEFT JOIN assets
          ON assets.id = project_documents.asset_id
        WHERE project_documents.project_id = $1
          AND project_documents.required_for_readiness = 1
          AND project_documents.status <> 'approved'

        UNION ALL

        SELECT
          assets.id AS id,
          'blocked_asset' AS attention_type,
          assets.tag || ' - ' || assets.name AS title,
          CASE
            WHEN COALESCE(systems.name, assets.system_name) = '' THEN
              'Blocked asset'
            ELSE
              COALESCE(systems.name, assets.system_name) || ' · Blocked asset'
          END AS detail,
          assets.status AS status,
          assets.updated_at AS updated_at,
          6 AS sort_priority,
          assets.tag AS match_text,
          NULL AS parent_id,
          NULL AS parent_title
        FROM assets
        LEFT JOIN systems
          ON systems.id = assets.system_id
        WHERE assets.project_id = $1
          AND assets.status = 'blocked'
      ) AS attention_items
      ORDER BY
        sort_priority ASC,
        updated_at DESC
      LIMIT 12
    `,
      [projectId, today],
    ),
    listStructureReadinessSummaries(projectId),
    database.select<ProjectActivityEventRow[]>(
      `
        SELECT action, details_json
        FROM audit_events
        WHERE project_id = $1
          AND created_at >= $2
      `,
      [projectId, sevenDaysAgo.toISOString()],
    ),
  ]);

  const row = overviewRows[0];

  if (!row) {
    throw new Error("Failed to calculate the project overview.");
  }

  const testItemTotal = toNumber(row.test_item_total);
  const testItemPending = toNumber(row.test_item_pending);
  const testItemCompleted = testItemTotal - testItemPending;
  const operationalAttentionItems = attentionRows.map(mapAttentionItem);
  const recentActivityCreated = activityRows.filter(
    (event) => event.action === "created",
  ).length;
  const recentActivityClosedOut = activityRows.filter(
    isClosedOutEvent,
  ).length;
  const blockedSystemCount = readinessSummaries.filter(
    (summary) =>
      summary.kind === "system" && summary.blockerCount > 0,
  ).length;
  const blockedSubsystemCount = readinessSummaries.filter(
    (summary) =>
      summary.kind === "subsystem" && summary.blockerCount > 0,
  ).length;
  const readinessAttentionItems = readinessSummaries
    .filter(
      (summary) =>
        summary.kind === "system" && summary.blockerCount > 0,
    )
    .map<ProjectAttentionItem>((summary) => ({
      id: summary.structureId,
      type: "system_readiness",
      title: summary.name,
      detail: `${summary.code ? `${summary.code} · ` : ""}${summary.blockerCount} readiness ${summary.blockerCount === 1 ? "blocker" : "blockers"}`,
      status: "blocked",
      updatedAt: summary.updatedAt,
      matchText: summary.name,
      parentId: null,
      parentTitle: null,
    }));

  return {
    assets: {
      total: toNumber(row.asset_total),
      notStarted: toNumber(row.asset_not_started),
      inProgress: toNumber(row.asset_in_progress),
      completed: toNumber(row.asset_completed),
      blocked: toNumber(row.asset_blocked),
    },
    testRecords: {
      total: toNumber(row.test_record_total),
      notStarted: toNumber(row.test_record_not_started),
      inProgress: toNumber(row.test_record_in_progress),
      completed: toNumber(row.test_record_completed),
      blocked: toNumber(row.test_record_blocked),
    },
    testItems: {
      total: testItemTotal,
      pending: testItemPending,
      passed: toNumber(row.test_item_passed),
      failed: toNumber(row.test_item_failed),
      notApplicable: toNumber(row.test_item_not_applicable),
      completed: testItemCompleted,
      completionPercent:
        testItemTotal === 0
          ? 0
          : Math.round((testItemCompleted / testItemTotal) * 100),
    },
    issues: {
      total: toNumber(row.issue_total),
      active: toNumber(row.issue_active),
      open: toNumber(row.issue_open),
      inProgress: toNumber(row.issue_in_progress),
      critical: toNumber(row.issue_critical),
      high: toNumber(row.issue_high),
      overdue: toNumber(row.issue_overdue),
      resolved: toNumber(row.issue_resolved),
      closed: toNumber(row.issue_closed),
    },
    scope: {
      systems: {
        total: toNumber(row.system_total),
        notStarted: toNumber(row.system_not_started),
        inProgress: toNumber(row.system_in_progress),
        ready: toNumber(row.system_ready),
        commissioned: toNumber(row.system_commissioned),
        handedOver: toNumber(row.system_handed_over),
        blocked: blockedSystemCount,
      },
      subsystems: {
        total: toNumber(row.subsystem_total),
        notStarted: toNumber(row.subsystem_not_started),
        inProgress: toNumber(row.subsystem_in_progress),
        ready: toNumber(row.subsystem_ready),
        commissioned: toNumber(row.subsystem_commissioned),
        handedOver: toNumber(row.subsystem_handed_over),
        blocked: blockedSubsystemCount,
      },
    },
    deliverables: {
      requiredDocumentsTotal: toNumber(row.required_document_total),
      requiredDocumentsApproved: toNumber(
        row.required_document_approved,
      ),
      testRecordsTotal: toNumber(row.test_record_total),
      testRecordsSigned: toNumber(row.test_record_signed),
      subsystemsTotal: toNumber(row.subsystem_total),
      subsystemsHandedOver: toNumber(row.subsystem_handed_over),
      turnoverPackagesTotal: toNumber(row.turnover_package_total),
      turnoverPackagesFinal: toNumber(row.turnover_package_final),
    },
    deadlines: {
      dueSoon: toNumber(row.issue_due_soon),
      overdue: toNumber(row.issue_overdue),
      noDueDate: toNumber(row.issue_no_due_date),
      unassigned: toNumber(row.issue_unassigned),
    },
    coverage: {
      assetsWithoutTestRecords: toNumber(
        row.assets_without_test_records,
      ),
      testRecordsWithoutItems: toNumber(
        row.test_records_without_items,
      ),
      systemsWithoutAssets: toNumber(row.systems_without_assets),
      subsystemsWithoutAssets: toNumber(
        row.subsystems_without_assets,
      ),
    },
    recentActivity: {
      created: recentActivityCreated,
      closedOut: recentActivityClosedOut,
      netChange: recentActivityCreated - recentActivityClosedOut,
    },
    attentionItems: [
      ...operationalAttentionItems.slice(0, 8),
      ...readinessAttentionItems,
    ].slice(0, 12),
  };
}
