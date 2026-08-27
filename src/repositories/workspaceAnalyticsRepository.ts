import { getDatabase } from "../services/database";
import type {
  WorkspaceAnalytics,
  WorkspaceDailyActivity,
  WorkspaceWeeklyActivity,
} from "../types/workspaceAnalytics";

interface WorkspaceSummaryRow {
  asset_total: number;
  asset_not_started: number;
  asset_in_progress: number;
  asset_completed: number;
  asset_blocked: number;
  test_item_total: number;
  test_item_pending: number;
  test_item_passed: number;
  test_item_failed: number;
  test_item_not_applicable: number;
  issue_active: number;
  issue_total: number;
  issue_open: number;
  issue_in_progress: number;
  issue_resolved: number;
  issue_closed: number;
  issue_critical: number;
  issue_overdue: number;
  project_attention_total: number;
  project_attention_critical: number;
  project_attention_overdue: number;
  required_document_total: number;
  required_document_approved: number;
  test_record_total: number;
  test_record_signed: number;
  handover_subsystem_total: number;
  handover_subsystem_complete: number;
}

interface ProjectPerformanceRow {
  project_id: string;
  project_name: string;
  asset_total: number;
  asset_completed: number;
  test_item_assessed: number;
  test_item_passed: number;
  issue_active: number;
  issue_critical: number;
  issue_overdue: number;
  subsystem_total: number;
  subsystem_handed_over: number;
}

interface ActivityEventRow {
  action: string;
  details_json: string;
  created_at: string;
}

function toNumber(value: number | null | undefined): number {
  return Number(value ?? 0);
}

function startOfLocalWeek(value: Date): Date {
  const result = new Date(value);
  const dayOffset = (result.getDay() + 6) % 7;

  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - dayOffset);

  return result;
}

function toLocalDateString(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createWeeklyActivity(now: Date): WorkspaceWeeklyActivity[] {
  const currentWeekStart = startOfLocalWeek(now);

  return Array.from({ length: 8 }, (_, index) => {
    const startDate = new Date(currentWeekStart);
    startDate.setDate(startDate.getDate() - (7 - index) * 7);

    return {
      startDate: toLocalDateString(startDate),
      label: startDate.toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      }),
      created: 0,
      closedOut: 0,
    };
  });
}

function createDailyActivity(
  firstWeekStart: Date,
  now: Date,
): WorkspaceDailyActivity[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dayCount =
    Math.round(
      (today.getTime() - firstWeekStart.getTime()) /
        (24 * 60 * 60 * 1000),
    ) + 1;

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(firstWeekStart);
    date.setDate(date.getDate() + index);

    return {
      startDate: toLocalDateString(date),
      label: date.toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      }),
      created: 0,
      closedOut: 0,
    };
  });
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

function isClosedOutEvent(event: ActivityEventRow): boolean {
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
    const result = readNestedValue(details, "after", "result");

    return result === "pass" || result === "not_applicable";
  }

  return false;
}

function getWeekIndex(
  eventDate: Date,
  firstWeekStart: Date,
): number {
  const eventWeekStart = startOfLocalWeek(eventDate);
  const elapsedMilliseconds =
    eventWeekStart.getTime() - firstWeekStart.getTime();

  return Math.round(elapsedMilliseconds / (7 * 24 * 60 * 60 * 1000));
}

function getDayIndex(eventDate: Date, firstWeekStart: Date): number {
  const eventDay = new Date(eventDate);
  eventDay.setHours(0, 0, 0, 0);

  return Math.round(
    (eventDay.getTime() - firstWeekStart.getTime()) /
      (24 * 60 * 60 * 1000),
  );
}

export async function getWorkspaceAnalytics(): Promise<WorkspaceAnalytics> {
  const database = await getDatabase();
  const now = new Date();
  const today = toLocalDateString(now);
  const weeklyActivity = createWeeklyActivity(now);
  const firstWeekStart = startOfLocalWeek(
    new Date(`${weeklyActivity[0].startDate}T00:00:00`),
  );
  const dailyActivity = createDailyActivity(firstWeekStart, now);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [summaryRows, projectPerformanceRows, activityRows] =
    await Promise.all([
    database.select<WorkspaceSummaryRow[]>(
      `
        SELECT
          (SELECT COUNT(*) FROM assets) AS asset_total,
          (
            SELECT COUNT(*) FROM assets
            WHERE status = 'not_started'
          ) AS asset_not_started,
          (
            SELECT COUNT(*) FROM assets
            WHERE status = 'in_progress'
          ) AS asset_in_progress,
          (
            SELECT COUNT(*) FROM assets
            WHERE status = 'completed'
          ) AS asset_completed,
          (
            SELECT COUNT(*) FROM assets
            WHERE status = 'blocked'
          ) AS asset_blocked,
          (SELECT COUNT(*) FROM test_items) AS test_item_total,
          (
            SELECT COUNT(*) FROM test_items
            WHERE result = 'pending'
          ) AS test_item_pending,
          (
            SELECT COUNT(*) FROM test_items
            WHERE result = 'pass'
          ) AS test_item_passed,
          (
            SELECT COUNT(*) FROM test_items
            WHERE result = 'fail'
          ) AS test_item_failed,
          (
            SELECT COUNT(*) FROM test_items
            WHERE result = 'not_applicable'
          ) AS test_item_not_applicable,
          (
            SELECT COUNT(*) FROM issues
          ) AS issue_total,
          (
            SELECT COUNT(*) FROM issues
            WHERE status = 'open'
          ) AS issue_open,
          (
            SELECT COUNT(*) FROM issues
            WHERE status = 'in_progress'
          ) AS issue_in_progress,
          (
            SELECT COUNT(*) FROM issues
            WHERE status = 'resolved'
          ) AS issue_resolved,
          (
            SELECT COUNT(*) FROM issues
            WHERE status = 'closed'
          ) AS issue_closed,
          (
            SELECT COUNT(*) FROM issues
            WHERE status IN ('open', 'in_progress')
          ) AS issue_active,
          (
            SELECT COUNT(*) FROM issues
            WHERE status IN ('open', 'in_progress')
              AND priority = 'critical'
          ) AS issue_critical,
          (
            SELECT COUNT(*) FROM issues
            WHERE status IN ('open', 'in_progress')
              AND due_date IS NOT NULL
              AND TRIM(due_date) <> ''
              AND DATE(due_date) < DATE($1)
          ) AS issue_overdue,
          (
            SELECT COUNT(*)
            FROM projects
            WHERE projects.status = 'active'
              AND (
                EXISTS (
                  SELECT 1
                  FROM assets
                  WHERE assets.project_id = projects.id
                    AND assets.status = 'blocked'
                )
                OR EXISTS (
                  SELECT 1
                  FROM test_items
                  INNER JOIN test_records
                    ON test_records.id = test_items.test_record_id
                  WHERE test_records.project_id = projects.id
                    AND test_items.result = 'fail'
                )
                OR EXISTS (
                  SELECT 1
                  FROM issues
                  WHERE issues.project_id = projects.id
                    AND issues.status IN ('open', 'in_progress')
                    AND (
                      issues.priority = 'critical'
                      OR (
                        issues.due_date IS NOT NULL
                        AND TRIM(issues.due_date) <> ''
                        AND DATE(issues.due_date) < DATE($1)
                      )
                    )
                )
              )
          ) AS project_attention_total,
          (
            SELECT COUNT(*)
            FROM projects
            WHERE projects.status = 'active'
              AND EXISTS (
                SELECT 1
                FROM issues
                WHERE issues.project_id = projects.id
                  AND issues.status IN ('open', 'in_progress')
                  AND issues.priority = 'critical'
              )
          ) AS project_attention_critical,
          (
            SELECT COUNT(*)
            FROM projects
            WHERE projects.status = 'active'
              AND EXISTS (
                SELECT 1
                FROM issues
                WHERE issues.project_id = projects.id
                  AND issues.status IN ('open', 'in_progress')
                  AND issues.due_date IS NOT NULL
                  AND TRIM(issues.due_date) <> ''
                  AND DATE(issues.due_date) < DATE($1)
              )
          ) AS project_attention_overdue,
          (
            SELECT COUNT(*) FROM project_documents
            WHERE required_for_readiness = 1
          ) AS required_document_total,
          (
            SELECT COUNT(*) FROM project_documents
            WHERE required_for_readiness = 1
              AND status = 'approved'
          ) AS required_document_approved,
          (
            SELECT COUNT(*) FROM test_records
          ) AS test_record_total,
          (
            SELECT COUNT(*) FROM test_records
            WHERE signed_off_at IS NOT NULL
              AND TRIM(signed_off_at) <> ''
          ) AS test_record_signed,
          (
            SELECT COUNT(*) FROM subsystems
          ) AS handover_subsystem_total,
          (
            SELECT COUNT(*) FROM subsystems
            WHERE commissioning_stage = 'handed_over'
          ) AS handover_subsystem_complete
      `,
      [today],
    ),
    database.select<ProjectPerformanceRow[]>(
      `
        WITH
          asset_metrics AS (
            SELECT
              project_id,
              COUNT(*) AS asset_total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)
                AS asset_completed,
              SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END)
                AS asset_blocked
            FROM assets
            GROUP BY project_id
          ),
          test_metrics AS (
            SELECT
              test_records.project_id,
              SUM(
                CASE
                  WHEN test_items.result IN ('pass', 'fail') THEN 1
                  ELSE 0
                END
              ) AS test_item_assessed,
              SUM(CASE WHEN test_items.result = 'pass' THEN 1 ELSE 0 END)
                AS test_item_passed,
              SUM(CASE WHEN test_items.result = 'fail' THEN 1 ELSE 0 END)
                AS test_item_failed
            FROM test_records
            INNER JOIN test_items
              ON test_items.test_record_id = test_records.id
            GROUP BY test_records.project_id
          ),
          issue_metrics AS (
            SELECT
              project_id,
              SUM(
                CASE
                  WHEN status IN ('open', 'in_progress') THEN 1
                  ELSE 0
                END
              ) AS issue_active,
              SUM(
                CASE
                  WHEN status IN ('open', 'in_progress')
                    AND priority = 'critical'
                  THEN 1
                  ELSE 0
                END
              ) AS issue_critical,
              SUM(
                CASE
                  WHEN status IN ('open', 'in_progress')
                    AND due_date IS NOT NULL
                    AND TRIM(due_date) <> ''
                    AND DATE(due_date) < DATE($1)
                  THEN 1
                  ELSE 0
                END
              ) AS issue_overdue
            FROM issues
            GROUP BY project_id
          ),
          subsystem_metrics AS (
            SELECT
              systems.project_id,
              COUNT(*) AS subsystem_total,
              SUM(
                CASE
                  WHEN subsystems.commissioning_stage = 'handed_over'
                  THEN 1
                  ELSE 0
                END
              ) AS subsystem_handed_over
            FROM subsystems
            INNER JOIN systems
              ON systems.id = subsystems.system_id
            GROUP BY systems.project_id
          )
        SELECT
          projects.id AS project_id,
          projects.name AS project_name,
          COALESCE(asset_metrics.asset_total, 0) AS asset_total,
          COALESCE(asset_metrics.asset_completed, 0) AS asset_completed,
          COALESCE(test_metrics.test_item_assessed, 0)
            AS test_item_assessed,
          COALESCE(test_metrics.test_item_passed, 0) AS test_item_passed,
          COALESCE(issue_metrics.issue_active, 0) AS issue_active,
          COALESCE(issue_metrics.issue_critical, 0) AS issue_critical,
          COALESCE(issue_metrics.issue_overdue, 0) AS issue_overdue,
          COALESCE(subsystem_metrics.subsystem_total, 0)
            AS subsystem_total,
          COALESCE(subsystem_metrics.subsystem_handed_over, 0)
            AS subsystem_handed_over
        FROM projects
        LEFT JOIN asset_metrics
          ON asset_metrics.project_id = projects.id
        LEFT JOIN test_metrics
          ON test_metrics.project_id = projects.id
        LEFT JOIN issue_metrics
          ON issue_metrics.project_id = projects.id
        LEFT JOIN subsystem_metrics
          ON subsystem_metrics.project_id = projects.id
        WHERE projects.status = 'active'
        ORDER BY
          CASE
            WHEN COALESCE(asset_metrics.asset_blocked, 0) > 0
              OR COALESCE(test_metrics.test_item_failed, 0) > 0
              OR COALESCE(issue_metrics.issue_critical, 0) > 0
              OR COALESCE(issue_metrics.issue_overdue, 0) > 0
            THEN 0
            ELSE 1
          END,
          COALESCE(issue_metrics.issue_critical, 0) DESC,
          COALESCE(issue_metrics.issue_overdue, 0) DESC,
          COALESCE(test_metrics.test_item_failed, 0) DESC,
          COALESCE(asset_metrics.asset_blocked, 0) DESC,
          COALESCE(issue_metrics.issue_active, 0) DESC,
          CASE
            WHEN COALESCE(test_metrics.test_item_assessed, 0) > 0
            THEN
              1.0 * COALESCE(test_metrics.test_item_passed, 0) /
              test_metrics.test_item_assessed
            ELSE 1
          END ASC,
          CASE
            WHEN COALESCE(asset_metrics.asset_total, 0) > 0
            THEN
              1.0 * COALESCE(asset_metrics.asset_completed, 0) /
              asset_metrics.asset_total
            ELSE 1
          END ASC,
          CASE
            WHEN COALESCE(subsystem_metrics.subsystem_total, 0) > 0
            THEN
              1.0 * COALESCE(
                subsystem_metrics.subsystem_handed_over,
                0
              ) / subsystem_metrics.subsystem_total
            ELSE 1
          END ASC,
          projects.updated_at DESC,
          projects.name COLLATE NOCASE ASC
      `,
      [today],
    ),
    database.select<ActivityEventRow[]>(
      `
        SELECT action, details_json, created_at
        FROM audit_events
        WHERE created_at >= $1
        ORDER BY created_at ASC
      `,
      [firstWeekStart.toISOString()],
    ),
  ]);

  const summary = summaryRows[0];
  const passed = toNumber(summary?.test_item_passed);
  const failed = toNumber(summary?.test_item_failed);
  const assessed = passed + failed;
  const recentActivity = {
    created: 0,
    updated: 0,
    closedOut: 0,
  };

  activityRows.forEach((event) => {
    const eventDate = new Date(event.created_at);

    if (Number.isNaN(eventDate.getTime())) {
      return;
    }

    const weekIndex = getWeekIndex(eventDate, firstWeekStart);
    const dayIndex = getDayIndex(eventDate, firstWeekStart);
    const isCreated = event.action === "created";
    const isClosedOut = isClosedOutEvent(event);

    if (weekIndex >= 0 && weekIndex < weeklyActivity.length) {
      if (isCreated) {
        weeklyActivity[weekIndex].created += 1;
      }

      if (isClosedOut) {
        weeklyActivity[weekIndex].closedOut += 1;
      }
    }

    if (dayIndex >= 0 && dayIndex < dailyActivity.length) {
      if (isCreated) {
        dailyActivity[dayIndex].created += 1;
      }

      if (isClosedOut) {
        dailyActivity[dayIndex].closedOut += 1;
      }
    }

    if (eventDate >= sevenDaysAgo) {
      if (isCreated) {
        recentActivity.created += 1;
      }

      if (event.action === "updated") {
        recentActivity.updated += 1;
      }

      if (isClosedOut) {
        recentActivity.closedOut += 1;
      }
    }
  });

  return {
    assets: {
      total: toNumber(summary?.asset_total),
      notStarted: toNumber(summary?.asset_not_started),
      inProgress: toNumber(summary?.asset_in_progress),
      completed: toNumber(summary?.asset_completed),
      blocked: toNumber(summary?.asset_blocked),
    },
    tests: {
      total: toNumber(summary?.test_item_total),
      pending: toNumber(summary?.test_item_pending),
      passed,
      failed,
      notApplicable: toNumber(summary?.test_item_not_applicable),
      assessed,
      passRate: assessed === 0 ? 0 : Math.round((passed / assessed) * 100),
    },
    issues: {
      total: toNumber(summary?.issue_total),
      open: toNumber(summary?.issue_open),
      inProgress: toNumber(summary?.issue_in_progress),
      resolved: toNumber(summary?.issue_resolved),
      closed: toNumber(summary?.issue_closed),
      active: toNumber(summary?.issue_active),
      critical: toNumber(summary?.issue_critical),
      overdue: toNumber(summary?.issue_overdue),
    },
    projectsRequiringAttention: {
      total: toNumber(summary?.project_attention_total),
      critical: toNumber(summary?.project_attention_critical),
      overdue: toNumber(summary?.project_attention_overdue),
    },
    projectPerformance: projectPerformanceRows.map((row) => {
      const assetTotal = toNumber(row.asset_total);
      const assetCompleted = toNumber(row.asset_completed);
      const assessedTestItems = toNumber(row.test_item_assessed);
      const passedTestItems = toNumber(row.test_item_passed);
      const activeIssues = toNumber(row.issue_active);
      const criticalIssues = toNumber(row.issue_critical);
      const overdueIssues = toNumber(row.issue_overdue);
      const subsystemTotal = toNumber(row.subsystem_total);
      const subsystemsHandedOver = toNumber(
        row.subsystem_handed_over,
      );

      return {
        projectId: row.project_id,
        projectName: row.project_name,
        assetTotal,
        assetCompleted,
        assessedTestItems,
        passedTestItems,
        activeIssues,
        criticalIssues,
        overdueIssues,
        subsystemTotal,
        subsystemsHandedOver,
      };
    }),
    deliverables: {
      requiredDocumentsTotal: toNumber(
        summary?.required_document_total,
      ),
      requiredDocumentsApproved: toNumber(
        summary?.required_document_approved,
      ),
      testRecordsTotal: toNumber(summary?.test_record_total),
      testRecordsSigned: toNumber(summary?.test_record_signed),
      handoverSubsystemsTotal: toNumber(
        summary?.handover_subsystem_total,
      ),
      handoverSubsystemsComplete: toNumber(
        summary?.handover_subsystem_complete,
      ),
    },
    recentActivity,
    weeklyActivity,
    dailyActivity,
  };
}
