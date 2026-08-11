import { getDatabase } from "../services/database";
import type { IssuePriority, IssueStatus } from "../types/issue";
import type {
  ReportLinkedIssue,
  ReportRecordSummary,
  ReportTestItem,
  TestRecordReportBundle,
} from "../types/report";
import type { TestItemResult, TestRecordType } from "../types/testRecord";

interface ReportRecordRow {
  id: string;
  project_id: string;
  asset_id: string | null;
  asset_tag: string | null;
  asset_name: string | null;
  asset_system_name: string | null;
  title: string;
  record_type: TestRecordType;
  description: string;
  total_item_count: number;
  passed_item_count: number;
  failed_item_count: number;
  not_applicable_item_count: number;
  executed_by: string;
  witnessed_by: string;
  execution_date: string;
  signed_off_by: string;
  signed_off_at: string;
  completion_notes: string;
  created_at: string;
  updated_at: string;
}

interface ReportTestItemRow {
  id: string;
  test_record_id: string;
  description: string;
  acceptance_criteria: string;
  result: TestItemResult;
  notes: string;
  sort_order: number;
  linked_issue_id: string | null;
  linked_issue_title: string | null;
  linked_issue_priority: IssuePriority | null;
  linked_issue_status: IssueStatus | null;
  linked_issue_owner: string | null;
  linked_issue_due_date: string | null;
}

const reportRecordSelect = `
  SELECT
    test_records.id,
    test_records.project_id,
    test_records.asset_id,
    assets.tag AS asset_tag,
    assets.name AS asset_name,
    COALESCE(systems.name, assets.system_name) AS asset_system_name,
    test_records.title,
    test_records.record_type,
    test_records.description,
    (
      SELECT COUNT(*)
      FROM test_items
      WHERE test_items.test_record_id = test_records.id
    ) AS total_item_count,
    (
      SELECT COUNT(*)
      FROM test_items
      WHERE test_items.test_record_id = test_records.id
        AND test_items.result = 'pass'
    ) AS passed_item_count,
    (
      SELECT COUNT(*)
      FROM test_items
      WHERE test_items.test_record_id = test_records.id
        AND test_items.result = 'fail'
    ) AS failed_item_count,
    (
      SELECT COUNT(*)
      FROM test_items
      WHERE test_items.test_record_id = test_records.id
        AND test_items.result = 'not_applicable'
    ) AS not_applicable_item_count,
    test_records.executed_by,
    test_records.witnessed_by,
    test_records.execution_date,
    test_records.signed_off_by,
    test_records.signed_off_at,
    test_records.completion_notes,
    test_records.created_at,
    test_records.updated_at
  FROM test_records
  LEFT JOIN assets
    ON assets.id = test_records.asset_id
  LEFT JOIN systems
    ON systems.id = assets.system_id
`;

function mapReportRecordRow(row: ReportRecordRow): ReportRecordSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    assetId: row.asset_id,
    assetTag: row.asset_tag,
    assetName: row.asset_name,
    assetSystemName: row.asset_system_name,
    title: row.title,
    recordType: row.record_type,
    description: row.description,
    totalItemCount: Number(row.total_item_count),
    passedItemCount: Number(row.passed_item_count),
    failedItemCount: Number(row.failed_item_count),
    notApplicableItemCount: Number(row.not_applicable_item_count),
    executedBy: row.executed_by,
    witnessedBy: row.witnessed_by,
    executionDate: row.execution_date,
    signedOffBy: row.signed_off_by,
    signedOffAt: row.signed_off_at,
    completionNotes: row.completion_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLinkedIssue(row: ReportTestItemRow): ReportLinkedIssue | null {
  if (
    !row.linked_issue_id ||
    !row.linked_issue_title ||
    !row.linked_issue_priority ||
    !row.linked_issue_status
  ) {
    return null;
  }

  return {
    id: row.linked_issue_id,
    title: row.linked_issue_title,
    priority: row.linked_issue_priority,
    status: row.linked_issue_status,
    owner: row.linked_issue_owner ?? "",
    dueDate: row.linked_issue_due_date,
  };
}

function mapReportTestItemRow(row: ReportTestItemRow): ReportTestItem {
  return {
    id: row.id,
    testRecordId: row.test_record_id,
    description: row.description,
    acceptanceCriteria: row.acceptance_criteria,
    result: row.result,
    notes: row.notes,
    sortOrder: Number(row.sort_order),
    linkedIssue: mapLinkedIssue(row),
  };
}

export async function listCompletedReportRecords(
  projectId: string,
): Promise<ReportRecordSummary[]> {
  const database = await getDatabase();
  const rows = await database.select<ReportRecordRow[]>(
    `
      ${reportRecordSelect}
      WHERE test_records.project_id = $1
        AND test_records.signed_off_at IS NOT NULL
      ORDER BY
        test_records.execution_date DESC,
        test_records.signed_off_at DESC,
        test_records.title COLLATE NOCASE ASC
    `,
    [projectId],
  );

  return rows.map(mapReportRecordRow);
}

export async function getTestRecordReportBundle(
  testRecordId: string,
): Promise<TestRecordReportBundle> {
  const database = await getDatabase();
  const recordRows = await database.select<ReportRecordRow[]>(
    `
      ${reportRecordSelect}
      WHERE test_records.id = $1
        AND test_records.signed_off_at IS NOT NULL
      LIMIT 1
    `,
    [testRecordId],
  );
  const recordRow = recordRows[0];

  if (!recordRow) {
    throw new Error("The completed checklist or test record was not found.");
  }

  const itemRows = await database.select<ReportTestItemRow[]>(
    `
      SELECT
        test_items.id,
        test_items.test_record_id,
        test_items.description,
        test_items.acceptance_criteria,
        test_items.result,
        test_items.notes,
        test_items.sort_order,
        issues.id AS linked_issue_id,
        issues.title AS linked_issue_title,
        issues.priority AS linked_issue_priority,
        issues.status AS linked_issue_status,
        issues.owner AS linked_issue_owner,
        issues.due_date AS linked_issue_due_date
      FROM test_items
      LEFT JOIN issue_test_item_links
        ON issue_test_item_links.test_item_id = test_items.id
      LEFT JOIN issues
        ON issues.id = issue_test_item_links.issue_id
      WHERE test_items.test_record_id = $1
      ORDER BY
        test_items.sort_order ASC,
        test_items.created_at ASC
    `,
    [testRecordId],
  );

  return {
    record: mapReportRecordRow(recordRow),
    items: itemRows.map(mapReportTestItemRow),
  };
}
