import { getDatabase } from "../services/database";
import type {
  CommissioningReadiness,
  ProjectStructureProgress,
  StructureProgress,
} from "../types/systemProgress";

interface StructureProgressRow {
  structure_id: string | null;
  asset_total: number;
  asset_in_progress: number;
  asset_completed: number;
  asset_blocked: number;
  test_record_total: number;
  test_record_completed: number;
  test_item_total: number;
  test_item_completed: number;
  test_item_failed: number;
  active_issue_total: number;
  critical_issue_total: number;
}

function toNumber(value: number | null | undefined): number {
  return Number(value ?? 0);
}

function calculateReadiness(
  assetTotal: number,
  assetInProgress: number,
  assetCompleted: number,
  assetBlocked: number,
  testRecordTotal: number,
  testRecordCompleted: number,
  testItemCompleted: number,
  testItemFailed: number,
  activeIssueTotal: number,
  criticalIssueTotal: number,
): CommissioningReadiness {
  if (
    assetBlocked > 0 ||
    testItemFailed > 0 ||
    criticalIssueTotal > 0
  ) {
    return "blocked";
  }

  if (
    assetTotal > 0 &&
    assetCompleted === assetTotal &&
    (testRecordTotal === 0 ||
      testRecordCompleted === testRecordTotal) &&
    activeIssueTotal === 0
  ) {
    return "ready";
  }

  const hasActivity =
    assetInProgress > 0 ||
    assetCompleted > 0 ||
    testItemCompleted > 0 ||
    testRecordCompleted > 0 ||
    activeIssueTotal > 0;

  return hasActivity ? "in_progress" : "not_started";
}

function mapProgressRow(row: StructureProgressRow): StructureProgress {
  const assetTotal = toNumber(row.asset_total);
  const assetInProgress = toNumber(row.asset_in_progress);
  const assetCompleted = toNumber(row.asset_completed);
  const assetBlocked = toNumber(row.asset_blocked);
  const testRecordTotal = toNumber(row.test_record_total);
  const testRecordCompleted = toNumber(row.test_record_completed);
  const testItemTotal = toNumber(row.test_item_total);
  const testItemCompleted = toNumber(row.test_item_completed);
  const testItemFailed = toNumber(row.test_item_failed);
  const activeIssueTotal = toNumber(row.active_issue_total);
  const criticalIssueTotal = toNumber(row.critical_issue_total);
  const completionPercent =
    testItemTotal > 0
      ? Math.round((testItemCompleted / testItemTotal) * 100)
      : assetTotal > 0
        ? Math.round((assetCompleted / assetTotal) * 100)
        : 0;

  return {
    structureId: row.structure_id,
    assetTotal,
    assetInProgress,
    assetCompleted,
    assetBlocked,
    testRecordTotal,
    testRecordCompleted,
    testItemTotal,
    testItemCompleted,
    testItemFailed,
    activeIssueTotal,
    criticalIssueTotal,
    completionPercent,
    readiness: calculateReadiness(
      assetTotal,
      assetInProgress,
      assetCompleted,
      assetBlocked,
      testRecordTotal,
      testRecordCompleted,
      testItemCompleted,
      testItemFailed,
      activeIssueTotal,
      criticalIssueTotal,
    ),
  };
}

const systemProgressQuery = `
  WITH asset_metrics AS (
    SELECT
      assets.system_id AS structure_id,
      COUNT(*) AS asset_total,
      SUM(CASE WHEN assets.status = 'in_progress' THEN 1 ELSE 0 END)
        AS asset_in_progress,
      SUM(CASE WHEN assets.status = 'completed' THEN 1 ELSE 0 END)
        AS asset_completed,
      SUM(CASE WHEN assets.status = 'blocked' THEN 1 ELSE 0 END)
        AS asset_blocked
    FROM assets
    WHERE assets.project_id = $1
      AND assets.system_id IS NOT NULL
    GROUP BY assets.system_id
  ),
  record_metrics AS (
    SELECT
      assets.system_id AS structure_id,
      COUNT(test_records.id) AS test_record_total,
      SUM(
        CASE
          WHEN test_records.signed_off_at IS NOT NULL THEN 1
          ELSE 0
        END
      ) AS test_record_completed
    FROM assets
    INNER JOIN test_records
      ON test_records.asset_id = assets.id
    WHERE assets.project_id = $1
      AND assets.system_id IS NOT NULL
    GROUP BY assets.system_id
  ),
  item_metrics AS (
    SELECT
      assets.system_id AS structure_id,
      COUNT(test_items.id) AS test_item_total,
      SUM(
        CASE
          WHEN test_items.result <> 'pending' THEN 1
          ELSE 0
        END
      ) AS test_item_completed,
      SUM(
        CASE
          WHEN test_items.result = 'fail' THEN 1
          ELSE 0
        END
      ) AS test_item_failed
    FROM assets
    INNER JOIN test_records
      ON test_records.asset_id = assets.id
    INNER JOIN test_items
      ON test_items.test_record_id = test_records.id
    WHERE assets.project_id = $1
      AND assets.system_id IS NOT NULL
    GROUP BY assets.system_id
  ),
  issue_metrics AS (
    SELECT
      assets.system_id AS structure_id,
      SUM(
        CASE
          WHEN issues.status IN ('open', 'in_progress') THEN 1
          ELSE 0
        END
      ) AS active_issue_total,
      SUM(
        CASE
          WHEN issues.status IN ('open', 'in_progress')
            AND issues.priority = 'critical' THEN 1
          ELSE 0
        END
      ) AS critical_issue_total
    FROM assets
    INNER JOIN issues
      ON issues.asset_id = assets.id
    WHERE assets.project_id = $1
      AND assets.system_id IS NOT NULL
    GROUP BY assets.system_id
  )
  SELECT
    systems.id AS structure_id,
    COALESCE(asset_metrics.asset_total, 0) AS asset_total,
    COALESCE(asset_metrics.asset_in_progress, 0) AS asset_in_progress,
    COALESCE(asset_metrics.asset_completed, 0) AS asset_completed,
    COALESCE(asset_metrics.asset_blocked, 0) AS asset_blocked,
    COALESCE(record_metrics.test_record_total, 0) AS test_record_total,
    COALESCE(record_metrics.test_record_completed, 0)
      AS test_record_completed,
    COALESCE(item_metrics.test_item_total, 0) AS test_item_total,
    COALESCE(item_metrics.test_item_completed, 0)
      AS test_item_completed,
    COALESCE(item_metrics.test_item_failed, 0) AS test_item_failed,
    COALESCE(issue_metrics.active_issue_total, 0)
      AS active_issue_total,
    COALESCE(issue_metrics.critical_issue_total, 0)
      AS critical_issue_total
  FROM systems
  LEFT JOIN asset_metrics
    ON asset_metrics.structure_id = systems.id
  LEFT JOIN record_metrics
    ON record_metrics.structure_id = systems.id
  LEFT JOIN item_metrics
    ON item_metrics.structure_id = systems.id
  LEFT JOIN issue_metrics
    ON issue_metrics.structure_id = systems.id
  WHERE systems.project_id = $1
  ORDER BY systems.name COLLATE NOCASE
`;

const subsystemProgressQuery = `
  WITH asset_metrics AS (
    SELECT
      assets.subsystem_id AS structure_id,
      COUNT(*) AS asset_total,
      SUM(CASE WHEN assets.status = 'in_progress' THEN 1 ELSE 0 END)
        AS asset_in_progress,
      SUM(CASE WHEN assets.status = 'completed' THEN 1 ELSE 0 END)
        AS asset_completed,
      SUM(CASE WHEN assets.status = 'blocked' THEN 1 ELSE 0 END)
        AS asset_blocked
    FROM assets
    WHERE assets.project_id = $1
      AND assets.subsystem_id IS NOT NULL
    GROUP BY assets.subsystem_id
  ),
  record_metrics AS (
    SELECT
      assets.subsystem_id AS structure_id,
      COUNT(test_records.id) AS test_record_total,
      SUM(
        CASE
          WHEN test_records.signed_off_at IS NOT NULL THEN 1
          ELSE 0
        END
      ) AS test_record_completed
    FROM assets
    INNER JOIN test_records
      ON test_records.asset_id = assets.id
    WHERE assets.project_id = $1
      AND assets.subsystem_id IS NOT NULL
    GROUP BY assets.subsystem_id
  ),
  item_metrics AS (
    SELECT
      assets.subsystem_id AS structure_id,
      COUNT(test_items.id) AS test_item_total,
      SUM(
        CASE
          WHEN test_items.result <> 'pending' THEN 1
          ELSE 0
        END
      ) AS test_item_completed,
      SUM(
        CASE
          WHEN test_items.result = 'fail' THEN 1
          ELSE 0
        END
      ) AS test_item_failed
    FROM assets
    INNER JOIN test_records
      ON test_records.asset_id = assets.id
    INNER JOIN test_items
      ON test_items.test_record_id = test_records.id
    WHERE assets.project_id = $1
      AND assets.subsystem_id IS NOT NULL
    GROUP BY assets.subsystem_id
  ),
  issue_metrics AS (
    SELECT
      assets.subsystem_id AS structure_id,
      SUM(
        CASE
          WHEN issues.status IN ('open', 'in_progress') THEN 1
          ELSE 0
        END
      ) AS active_issue_total,
      SUM(
        CASE
          WHEN issues.status IN ('open', 'in_progress')
            AND issues.priority = 'critical' THEN 1
          ELSE 0
        END
      ) AS critical_issue_total
    FROM assets
    INNER JOIN issues
      ON issues.asset_id = assets.id
    WHERE assets.project_id = $1
      AND assets.subsystem_id IS NOT NULL
    GROUP BY assets.subsystem_id
  )
  SELECT
    subsystems.id AS structure_id,
    COALESCE(asset_metrics.asset_total, 0) AS asset_total,
    COALESCE(asset_metrics.asset_in_progress, 0) AS asset_in_progress,
    COALESCE(asset_metrics.asset_completed, 0) AS asset_completed,
    COALESCE(asset_metrics.asset_blocked, 0) AS asset_blocked,
    COALESCE(record_metrics.test_record_total, 0) AS test_record_total,
    COALESCE(record_metrics.test_record_completed, 0)
      AS test_record_completed,
    COALESCE(item_metrics.test_item_total, 0) AS test_item_total,
    COALESCE(item_metrics.test_item_completed, 0)
      AS test_item_completed,
    COALESCE(item_metrics.test_item_failed, 0) AS test_item_failed,
    COALESCE(issue_metrics.active_issue_total, 0)
      AS active_issue_total,
    COALESCE(issue_metrics.critical_issue_total, 0)
      AS critical_issue_total
  FROM subsystems
  INNER JOIN systems
    ON systems.id = subsystems.system_id
  LEFT JOIN asset_metrics
    ON asset_metrics.structure_id = subsystems.id
  LEFT JOIN record_metrics
    ON record_metrics.structure_id = subsystems.id
  LEFT JOIN item_metrics
    ON item_metrics.structure_id = subsystems.id
  LEFT JOIN issue_metrics
    ON issue_metrics.structure_id = subsystems.id
  WHERE systems.project_id = $1
  ORDER BY
    systems.name COLLATE NOCASE,
    subsystems.name COLLATE NOCASE
`;

const unassignedProgressQuery = `
  SELECT
    NULL AS structure_id,
    COUNT(DISTINCT assets.id) AS asset_total,
    COUNT(
      DISTINCT CASE
        WHEN assets.status = 'in_progress' THEN assets.id
      END
    ) AS asset_in_progress,
    COUNT(
      DISTINCT CASE
        WHEN assets.status = 'completed' THEN assets.id
      END
    ) AS asset_completed,
    COUNT(
      DISTINCT CASE
        WHEN assets.status = 'blocked' THEN assets.id
      END
    ) AS asset_blocked,
    COUNT(DISTINCT test_records.id) AS test_record_total,
    COUNT(
      DISTINCT CASE
        WHEN test_records.signed_off_at IS NOT NULL THEN test_records.id
      END
    ) AS test_record_completed,
    COUNT(DISTINCT test_items.id) AS test_item_total,
    COUNT(
      DISTINCT CASE
        WHEN test_items.result <> 'pending' THEN test_items.id
      END
    ) AS test_item_completed,
    COUNT(
      DISTINCT CASE
        WHEN test_items.result = 'fail' THEN test_items.id
      END
    ) AS test_item_failed,
    COUNT(
      DISTINCT CASE
        WHEN issues.status IN ('open', 'in_progress') THEN issues.id
      END
    ) AS active_issue_total,
    COUNT(
      DISTINCT CASE
        WHEN issues.status IN ('open', 'in_progress')
          AND issues.priority = 'critical' THEN issues.id
      END
    ) AS critical_issue_total
  FROM assets
  LEFT JOIN test_records
    ON test_records.asset_id = assets.id
  LEFT JOIN test_items
    ON test_items.test_record_id = test_records.id
  LEFT JOIN issues
    ON issues.asset_id = assets.id
  WHERE assets.project_id = $1
    AND assets.system_id IS NULL
`;

export async function getProjectStructureProgress(
  projectId: string,
): Promise<ProjectStructureProgress> {
  const database = await getDatabase();
  const [systemRows, subsystemRows, unassignedRows] = await Promise.all([
    database.select<StructureProgressRow[]>(systemProgressQuery, [projectId]),
    database.select<StructureProgressRow[]>(subsystemProgressQuery, [projectId]),
    database.select<StructureProgressRow[]>(unassignedProgressQuery, [projectId]),
  ]);

  const emptyUnassignedRow: StructureProgressRow = {
    structure_id: null,
    asset_total: 0,
    asset_in_progress: 0,
    asset_completed: 0,
    asset_blocked: 0,
    test_record_total: 0,
    test_record_completed: 0,
    test_item_total: 0,
    test_item_completed: 0,
    test_item_failed: 0,
    active_issue_total: 0,
    critical_issue_total: 0,
  };

  return {
    systems: systemRows.map(mapProgressRow),
    subsystems: subsystemRows.map(mapProgressRow),
    unassigned: mapProgressRow(unassignedRows[0] ?? emptyUnassignedRow),
  };
}
