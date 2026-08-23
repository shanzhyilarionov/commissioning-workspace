import { getDatabase } from "../services/database";
import type {
  WorkspaceAnalytics,
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
  issue_critical: number;
  issue_overdue: number;
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

export async function getWorkspaceAnalytics(): Promise<WorkspaceAnalytics> {
  const database = await getDatabase();
  const now = new Date();
  const today = toLocalDateString(now);
  const weeklyActivity = createWeeklyActivity(now);
  const firstWeekStart = startOfLocalWeek(
    new Date(`${weeklyActivity[0].startDate}T00:00:00`),
  );
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [summaryRows, activityRows] = await Promise.all([
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
          ) AS issue_overdue
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
      active: toNumber(summary?.issue_active),
      critical: toNumber(summary?.issue_critical),
      overdue: toNumber(summary?.issue_overdue),
    },
    recentActivity,
    weeklyActivity,
  };
}
