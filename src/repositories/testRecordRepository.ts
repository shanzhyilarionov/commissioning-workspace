import { getDatabase } from "../services/database";
import type { IssueStatus } from "../types/issue";
import type {
  TestItem,
  TestItemInput,
  TestItemResult,
  TestRecord,
  TestRecordInput,
  TestRecordStatus,
  TestRecordType,
} from "../types/testRecord";

interface TestRecordRow {
  id: string;
  project_id: string;
  asset_id: string | null;
  asset_tag: string | null;
  asset_name: string | null;
  title: string;
  record_type: TestRecordType;
  description: string;
  completed_item_count: number;
  failed_item_count: number;
  total_item_count: number;
  created_at: string;
  updated_at: string;
}

interface TestItemRow {
  id: string;
  test_record_id: string;
  description: string;
  acceptance_criteria: string;
  result: TestItemResult;
  notes: string;
  sort_order: number;
  linked_issue_id: string | null;
  linked_issue_status: IssueStatus | null;
  created_at: string;
  updated_at: string;
}

function calculateTestRecordStatus(
  totalItemCount: number,
  completedItemCount: number,
  failedItemCount: number,
): TestRecordStatus {
  if (failedItemCount > 0) {
    return "blocked";
  }

  if (
    totalItemCount === 0 ||
    completedItemCount === 0
  ) {
    return "not_started";
  }

  if (completedItemCount < totalItemCount) {
    return "in_progress";
  }

  return "completed";
}

function mapTestRecordRow(
  row: TestRecordRow,
): TestRecord {
  const totalItemCount = Number(
    row.total_item_count,
  );
  const completedItemCount = Number(
    row.completed_item_count,
  );
  const failedItemCount = Number(
    row.failed_item_count,
  );

  return {
    id: row.id,
    projectId: row.project_id,
    assetId: row.asset_id,
    assetTag: row.asset_tag,
    assetName: row.asset_name,
    title: row.title,
    recordType: row.record_type,
    description: row.description,
    status: calculateTestRecordStatus(
      totalItemCount,
      completedItemCount,
      failedItemCount,
    ),
    completedItemCount,
    failedItemCount,
    totalItemCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTestItemRow(
  row: TestItemRow,
): TestItem {
  return {
    id: row.id,
    testRecordId: row.test_record_id,
    description: row.description,
    acceptanceCriteria:
      row.acceptance_criteria,
    result: row.result,
    notes: row.notes,
    sortOrder: Number(row.sort_order),
    linkedIssueId: row.linked_issue_id,
    linkedIssueStatus:
      row.linked_issue_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSortOrder(
  sortOrder: number,
): number {
  if (!Number.isFinite(sortOrder)) {
    return 0;
  }

  return Math.max(
    0,
    Math.trunc(sortOrder),
  );
}

async function assertAssetBelongsToProject(
  projectId: string,
  assetId: string | null,
): Promise<void> {
  if (!assetId) {
    return;
  }

  const database = await getDatabase();
  const rows = await database.select<
    { id: string }[]
  >(
    `
      SELECT id
      FROM assets
      WHERE id = $1
        AND project_id = $2
      LIMIT 1
    `,
    [assetId, projectId],
  );

  if (rows.length === 0) {
    throw new Error(
      "The selected asset does not belong to this project.",
    );
  }
}

async function touchTestRecord(
  testRecordId: string,
): Promise<void> {
  const database = await getDatabase();
  const updatedAt =
    new Date().toISOString();

  await database.execute(
    `
      UPDATE test_records
      SET updated_at = $1
      WHERE id = $2
    `,
    [updatedAt, testRecordId],
  );
}

export async function getTestRecordById(
  testRecordId: string,
): Promise<TestRecord> {
  const database = await getDatabase();
  const rows = await database.select<
    TestRecordRow[]
  >(
    `
      SELECT
        test_records.id,
        test_records.project_id,
        test_records.asset_id,
        assets.tag AS asset_tag,
        assets.name AS asset_name,
        test_records.title,
        test_records.record_type,
        test_records.description,
        (
          SELECT COUNT(*)
          FROM test_items
          WHERE test_items.test_record_id =
            test_records.id
        ) AS total_item_count,
        (
          SELECT COUNT(*)
          FROM test_items
          WHERE test_items.test_record_id =
            test_records.id
            AND test_items.result <> 'pending'
        ) AS completed_item_count,
        (
          SELECT COUNT(*)
          FROM test_items
          WHERE test_items.test_record_id =
            test_records.id
            AND test_items.result = 'fail'
        ) AS failed_item_count,
        test_records.created_at,
        test_records.updated_at
      FROM test_records
      LEFT JOIN assets
        ON assets.id =
          test_records.asset_id
      WHERE test_records.id = $1
      LIMIT 1
    `,
    [testRecordId],
  );

  const row = rows[0];

  if (!row) {
    throw new Error(
      "Checklist or test record not found.",
    );
  }

  return mapTestRecordRow(row);
}

export async function getTestItemById(
  testItemId: string,
): Promise<TestItem> {
  const database = await getDatabase();
  const rows = await database.select<
    TestItemRow[]
  >(
    `
      SELECT
        test_items.id,
        test_items.test_record_id,
        test_items.description,
        test_items.acceptance_criteria,
        test_items.result,
        test_items.notes,
        test_items.sort_order,
        issue_test_item_links.issue_id
          AS linked_issue_id,
        issues.status
          AS linked_issue_status,
        test_items.created_at,
        test_items.updated_at
      FROM test_items
      LEFT JOIN issue_test_item_links
        ON issue_test_item_links.test_item_id =
          test_items.id
      LEFT JOIN issues
        ON issues.id =
          issue_test_item_links.issue_id
      WHERE test_items.id = $1
      LIMIT 1
    `,
    [testItemId],
  );

  const row = rows[0];

  if (!row) {
    throw new Error(
      "Test item not found.",
    );
  }

  return mapTestItemRow(row);
}

export async function listTestRecordsByProject(
  projectId: string,
): Promise<TestRecord[]> {
  const database = await getDatabase();
  const rows = await database.select<
    TestRecordRow[]
  >(
    `
      SELECT
        test_records.id,
        test_records.project_id,
        test_records.asset_id,
        assets.tag AS asset_tag,
        assets.name AS asset_name,
        test_records.title,
        test_records.record_type,
        test_records.description,
        (
          SELECT COUNT(*)
          FROM test_items
          WHERE test_items.test_record_id =
            test_records.id
        ) AS total_item_count,
        (
          SELECT COUNT(*)
          FROM test_items
          WHERE test_items.test_record_id =
            test_records.id
            AND test_items.result <> 'pending'
        ) AS completed_item_count,
        (
          SELECT COUNT(*)
          FROM test_items
          WHERE test_items.test_record_id =
            test_records.id
            AND test_items.result = 'fail'
        ) AS failed_item_count,
        test_records.created_at,
        test_records.updated_at
      FROM test_records
      LEFT JOIN assets
        ON assets.id =
          test_records.asset_id
      WHERE test_records.project_id = $1
      ORDER BY
        test_records.updated_at DESC
    `,
    [projectId],
  );

  return rows.map(mapTestRecordRow);
}

export async function createTestRecord(
  projectId: string,
  input: TestRecordInput,
): Promise<TestRecord> {
  const title = input.title.trim();

  if (!title) {
    throw new Error(
      "Checklist or test title is required.",
    );
  }

  await assertAssetBelongsToProject(
    projectId,
    input.assetId,
  );

  const database = await getDatabase();
  const testRecordId =
    crypto.randomUUID();
  const timestamp =
    new Date().toISOString();

  await database.execute(
    `
      INSERT INTO test_records (
        id,
        project_id,
        asset_id,
        title,
        record_type,
        description,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8
      )
    `,
    [
      testRecordId,
      projectId,
      input.assetId,
      title,
      input.recordType,
      input.description.trim(),
      timestamp,
      timestamp,
    ],
  );

  return getTestRecordById(
    testRecordId,
  );
}

export async function updateTestRecord(
  testRecordId: string,
  input: TestRecordInput,
): Promise<TestRecord> {
  const existingTestRecord =
    await getTestRecordById(
      testRecordId,
    );
  const title = input.title.trim();

  if (!title) {
    throw new Error(
      "Checklist or test title is required.",
    );
  }

  await assertAssetBelongsToProject(
    existingTestRecord.projectId,
    input.assetId,
  );

  const database = await getDatabase();
  const updatedAt =
    new Date().toISOString();

  await database.execute(
    `
      UPDATE test_records
      SET
        asset_id = $1,
        title = $2,
        record_type = $3,
        description = $4,
        updated_at = $5
      WHERE id = $6
    `,
    [
      input.assetId,
      title,
      input.recordType,
      input.description.trim(),
      updatedAt,
      testRecordId,
    ],
  );

  return getTestRecordById(
    testRecordId,
  );
}

export async function deleteTestRecord(
  testRecordId: string,
): Promise<void> {
  await getTestRecordById(
    testRecordId,
  );

  const database = await getDatabase();

  await database.execute(
    `
      DELETE FROM test_records
      WHERE id = $1
    `,
    [testRecordId],
  );
}

export async function listTestItems(
  testRecordId: string,
): Promise<TestItem[]> {
  await getTestRecordById(
    testRecordId,
  );

  const database = await getDatabase();
  const rows = await database.select<
    TestItemRow[]
  >(
    `
      SELECT
        test_items.id,
        test_items.test_record_id,
        test_items.description,
        test_items.acceptance_criteria,
        test_items.result,
        test_items.notes,
        test_items.sort_order,
        issue_test_item_links.issue_id
          AS linked_issue_id,
        issues.status
          AS linked_issue_status,
        test_items.created_at,
        test_items.updated_at
      FROM test_items
      LEFT JOIN issue_test_item_links
        ON issue_test_item_links.test_item_id =
          test_items.id
      LEFT JOIN issues
        ON issues.id =
          issue_test_item_links.issue_id
      WHERE test_items.test_record_id = $1
      ORDER BY
        test_items.sort_order ASC,
        test_items.created_at ASC
    `,
    [testRecordId],
  );

  return rows.map(mapTestItemRow);
}

export async function createTestItem(
  testRecordId: string,
  input: TestItemInput,
): Promise<TestItem> {
  await getTestRecordById(
    testRecordId,
  );

  const description =
    input.description.trim();

  if (!description) {
    throw new Error(
      "Test item description is required.",
    );
  }

  const database = await getDatabase();
  const testItemId =
    crypto.randomUUID();
  const timestamp =
    new Date().toISOString();

  await database.execute(
    `
      INSERT INTO test_items (
        id,
        test_record_id,
        description,
        acceptance_criteria,
        result,
        notes,
        sort_order,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9
      )
    `,
    [
      testItemId,
      testRecordId,
      description,
      input.acceptanceCriteria.trim(),
      input.result,
      input.notes.trim(),
      normalizeSortOrder(
        input.sortOrder,
      ),
      timestamp,
      timestamp,
    ],
  );

  await touchTestRecord(
    testRecordId,
  );

  return getTestItemById(
    testItemId,
  );
}

export async function updateTestItem(
  testItemId: string,
  input: TestItemInput,
): Promise<TestItem> {
  const existingTestItem =
    await getTestItemById(
      testItemId,
    );
  const description =
    input.description.trim();

  if (!description) {
    throw new Error(
      "Test item description is required.",
    );
  }

  const database = await getDatabase();
  const updatedAt =
    new Date().toISOString();

  await database.execute(
    `
      UPDATE test_items
      SET
        description = $1,
        acceptance_criteria = $2,
        result = $3,
        notes = $4,
        sort_order = $5,
        updated_at = $6
      WHERE id = $7
    `,
    [
      description,
      input.acceptanceCriteria.trim(),
      input.result,
      input.notes.trim(),
      normalizeSortOrder(
        input.sortOrder,
      ),
      updatedAt,
      testItemId,
    ],
  );

  await touchTestRecord(
    existingTestItem.testRecordId,
  );

  return getTestItemById(
    testItemId,
  );
}

export async function deleteTestItem(
  testItemId: string,
): Promise<void> {
  const existingTestItem =
    await getTestItemById(
      testItemId,
    );
  const database = await getDatabase();

  await database.execute(
    `
      DELETE FROM test_items
      WHERE id = $1
    `,
    [testItemId],
  );

  await touchTestRecord(
    existingTestItem.testRecordId,
  );
}
