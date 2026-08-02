import { getDatabase } from "../services/database";
import type {
  TestItemResult,
  TestRecordType,
} from "../types/testRecord";

interface FailedTestItemContextRow {
  test_item_id: string;
  test_item_description: string;
  acceptance_criteria: string;
  result: TestItemResult;
  notes: string;
  test_record_title: string;
  record_type: TestRecordType;
  project_id: string;
  asset_id: string | null;
  linked_issue_id: string | null;
}

function formatRecordType(
  recordType: TestRecordType,
): string {
  return recordType === "checklist"
    ? "checklist"
    : "functional test";
}

function buildIssueDescription(
  row: FailedTestItemContextRow,
): string {
  const sections = [
    `Failed during ${formatRecordType(
      row.record_type,
    )}: ${row.test_record_title}.`,
  ];

  if (row.acceptance_criteria.trim()) {
    sections.push(
      `Acceptance criteria:\n${row.acceptance_criteria.trim()}`,
    );
  }

  if (row.notes.trim()) {
    sections.push(
      `Test notes:\n${row.notes.trim()}`,
    );
  }

  return sections.join("\n\n");
}

export async function createIssueFromFailedTestItem(
  testItemId: string,
): Promise<string> {
  const database = await getDatabase();

  await database.execute(
    "BEGIN IMMEDIATE TRANSACTION",
  );

  try {
    const rows = await database.select<
      FailedTestItemContextRow[]
    >(
      `
        SELECT
          test_items.id AS test_item_id,
          test_items.description
            AS test_item_description,
          test_items.acceptance_criteria,
          test_items.result,
          test_items.notes,
          test_records.title
            AS test_record_title,
          test_records.record_type,
          test_records.project_id,
          test_records.asset_id,
          issue_test_item_links.issue_id
            AS linked_issue_id
        FROM test_items
        INNER JOIN test_records
          ON test_records.id =
            test_items.test_record_id
        LEFT JOIN issue_test_item_links
          ON issue_test_item_links.test_item_id =
            test_items.id
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

    if (row.result !== "fail") {
      throw new Error(
        "Only failed test items can create issues.",
      );
    }

    if (row.linked_issue_id) {
      throw new Error(
        "This test item already has a linked issue.",
      );
    }

    const issueId =
      crypto.randomUUID();
    const timestamp =
      new Date().toISOString();
    const title =
      `Test failure: ${row.test_item_description.trim()}`;
    const description =
      buildIssueDescription(row);

    await database.execute(
      `
        INSERT INTO issues (
          id,
          project_id,
          asset_id,
          title,
          description,
          priority,
          status,
          owner,
          due_date,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          'high',
          'open',
          '',
          NULL,
          $6,
          $7
        )
      `,
      [
        issueId,
        row.project_id,
        row.asset_id,
        title,
        description,
        timestamp,
        timestamp,
      ],
    );

    await database.execute(
      `
        INSERT INTO issue_test_item_links (
          issue_id,
          test_item_id
        )
        VALUES ($1, $2)
      `,
      [issueId, row.test_item_id],
    );

    await database.execute(
      "COMMIT",
    );

    return issueId;
  } catch (error) {
    try {
      await database.execute(
        "ROLLBACK",
      );
    } catch {
      throw error;
    }

    throw error;
  }
}
