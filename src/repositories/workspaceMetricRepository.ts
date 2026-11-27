import { getDatabase } from "../services/database";
import type { AssetStatus } from "../types/asset";
import type { IssuePriority } from "../types/issue";
import type {
  WorkspaceAssetEntry,
  WorkspaceAttentionProjectEntry,
  WorkspaceIssueEntry,
  WorkspaceMetricEntryOf,
  WorkspaceMetricKind,
  WorkspaceTestResultEntry,
} from "../types/workspaceMetric";
import { toLocalDateString } from "./workspaceAnalyticsRepository";

// Each list reproduces the population counted by the matching Home metric card
// in workspaceAnalyticsRepository, so the totals on both screens always agree.

interface AssetRow {
  id: string;
  project_id: string;
  project_name: string;
  tag: string;
  name: string;
  system_label: string | null;
  status: AssetStatus;
}

interface TestResultRow {
  id: string;
  project_id: string;
  project_name: string;
  description: string;
  record_id: string;
  record_title: string;
  result: "pass" | "fail";
}

interface IssueRow {
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  priority: IssuePriority;
  status: "open" | "in_progress";
  due_date: string | null;
  is_overdue: number;
}

interface AttentionProjectRow {
  project_id: string;
  project_name: string;
  critical_issues: number | null;
  overdue_issues: number | null;
  failed_test_items: number | null;
  blocked_assets: number | null;
}

const OVERDUE_CONDITION = `
  issues.due_date IS NOT NULL
  AND TRIM(issues.due_date) <> ''
  AND DATE(issues.due_date) < DATE($1)
`;

async function listAssets(): Promise<WorkspaceAssetEntry[]> {
  const database = await getDatabase();
  const rows = await database.select<AssetRow[]>(`
    SELECT assets.id, assets.project_id, projects.name AS project_name,
      assets.tag, assets.name, assets.status,
      CASE
        WHEN systems.id IS NULL THEN NULL
        WHEN TRIM(systems.code) <> '' THEN systems.code || ' - ' || systems.name
        ELSE systems.name
      END AS system_label
    FROM assets
    INNER JOIN projects ON projects.id = assets.project_id
    LEFT JOIN systems ON systems.id = assets.system_id
    ORDER BY
      CASE assets.status
        WHEN 'blocked' THEN 0
        WHEN 'in_progress' THEN 1
        WHEN 'not_started' THEN 2
        ELSE 3
      END,
      projects.name COLLATE NOCASE, assets.tag COLLATE NOCASE, assets.id
  `);

  return rows.map((row) => ({
    kind: "assets",
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    tag: row.tag,
    name: row.name,
    system: row.system_label ?? "",
    status: row.status,
  }));
}

async function listTestResults(): Promise<WorkspaceTestResultEntry[]> {
  const database = await getDatabase();
  const rows = await database.select<TestResultRow[]>(`
    SELECT items.id, records.project_id, projects.name AS project_name,
      items.description, records.id AS record_id,
      records.title AS record_title, items.result
    FROM test_items AS items
    INNER JOIN test_records AS records ON records.id = items.test_record_id
    INNER JOIN projects ON projects.id = records.project_id
    WHERE items.result IN ('pass', 'fail')
    ORDER BY
      CASE items.result WHEN 'fail' THEN 0 ELSE 1 END,
      projects.name COLLATE NOCASE, records.title COLLATE NOCASE,
      records.id, items.sort_order, items.id
  `);

  return rows.map((row) => ({
    kind: "test_results",
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    description: row.description,
    recordId: row.record_id,
    recordTitle: row.record_title,
    result: row.result,
  }));
}

async function listActiveIssues(now: Date): Promise<WorkspaceIssueEntry[]> {
  const database = await getDatabase();
  const rows = await database.select<IssueRow[]>(
    `
      SELECT issues.id, issues.project_id, projects.name AS project_name,
        issues.title, issues.priority, issues.status, issues.due_date,
        CASE WHEN ${OVERDUE_CONDITION} THEN 1 ELSE 0 END AS is_overdue
      FROM issues
      INNER JOIN projects ON projects.id = issues.project_id
      WHERE issues.status IN ('open', 'in_progress')
      ORDER BY
        CASE issues.priority
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        is_overdue DESC,
        CASE
          WHEN issues.due_date IS NULL OR TRIM(issues.due_date) = '' THEN 1
          ELSE 0
        END,
        DATE(issues.due_date),
        projects.name COLLATE NOCASE, issues.title COLLATE NOCASE, issues.id
    `,
    [toLocalDateString(now)],
  );

  return rows.map((row) => ({
    kind: "active_issues",
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    title: row.title,
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date?.trim() ? row.due_date : null,
    isOverdue: Number(row.is_overdue) === 1,
  }));
}

async function listAttentionProjects(
  now: Date,
): Promise<WorkspaceAttentionProjectEntry[]> {
  const database = await getDatabase();
  const rows = await database.select<AttentionProjectRow[]>(
    `
      WITH
        issue_metrics AS (
          SELECT issues.project_id,
            SUM(CASE WHEN issues.priority = 'critical' THEN 1 ELSE 0 END)
              AS critical_issues,
            SUM(CASE WHEN ${OVERDUE_CONDITION} THEN 1 ELSE 0 END)
              AS overdue_issues
          FROM issues
          WHERE issues.status IN ('open', 'in_progress')
          GROUP BY issues.project_id
        ),
        test_metrics AS (
          SELECT test_records.project_id, COUNT(*) AS failed_test_items
          FROM test_items
          INNER JOIN test_records
            ON test_records.id = test_items.test_record_id
          WHERE test_items.result = 'fail'
          GROUP BY test_records.project_id
        ),
        asset_metrics AS (
          SELECT project_id, COUNT(*) AS blocked_assets
          FROM assets
          WHERE status = 'blocked'
          GROUP BY project_id
        )
      SELECT projects.id AS project_id, projects.name AS project_name,
        COALESCE(issue_metrics.critical_issues, 0) AS critical_issues,
        COALESCE(issue_metrics.overdue_issues, 0) AS overdue_issues,
        COALESCE(test_metrics.failed_test_items, 0) AS failed_test_items,
        COALESCE(asset_metrics.blocked_assets, 0) AS blocked_assets
      FROM projects
      LEFT JOIN issue_metrics ON issue_metrics.project_id = projects.id
      LEFT JOIN test_metrics ON test_metrics.project_id = projects.id
      LEFT JOIN asset_metrics ON asset_metrics.project_id = projects.id
      WHERE projects.status = 'active'
        AND (
          COALESCE(issue_metrics.critical_issues, 0) > 0
          OR COALESCE(issue_metrics.overdue_issues, 0) > 0
          OR COALESCE(test_metrics.failed_test_items, 0) > 0
          OR COALESCE(asset_metrics.blocked_assets, 0) > 0
        )
      ORDER BY critical_issues DESC, overdue_issues DESC,
        failed_test_items DESC, blocked_assets DESC,
        projects.name COLLATE NOCASE, projects.id
    `,
    [toLocalDateString(now)],
  );

  return rows.map((row) => ({
    kind: "attention_projects",
    id: row.project_id,
    projectId: row.project_id,
    projectName: row.project_name,
    criticalIssues: Number(row.critical_issues ?? 0),
    overdueIssues: Number(row.overdue_issues ?? 0),
    failedTestItems: Number(row.failed_test_items ?? 0),
    blockedAssets: Number(row.blocked_assets ?? 0),
  }));
}

export async function listWorkspaceMetricEntries<
  Kind extends WorkspaceMetricKind,
>(kind: Kind, now = new Date()): Promise<WorkspaceMetricEntryOf<Kind>[]> {
  switch (kind) {
    case "assets":
      return (await listAssets()) as WorkspaceMetricEntryOf<Kind>[];
    case "test_results":
      return (await listTestResults()) as WorkspaceMetricEntryOf<Kind>[];
    case "active_issues":
      return (await listActiveIssues(now)) as WorkspaceMetricEntryOf<Kind>[];
    case "attention_projects":
      return (await listAttentionProjects(
        now,
      )) as WorkspaceMetricEntryOf<Kind>[];
  }

  throw new Error(`Unknown workspace metric: ${String(kind)}`);
}
