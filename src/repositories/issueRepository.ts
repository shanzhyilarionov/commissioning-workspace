import { getDatabase } from "../services/database";
import type {
  Issue,
  IssueInput,
  IssuePriority,
  IssueStatus,
} from "../types/issue";

interface IssueRow {
  id: string;
  project_id: string;
  asset_id: string | null;
  asset_tag: string | null;
  asset_name: string | null;
  title: string;
  description: string;
  priority: IssuePriority;
  status: IssueStatus;
  owner: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

function mapIssueRow(row: IssueRow): Issue {
  return {
    id: row.id,
    projectId: row.project_id,
    assetId: row.asset_id,
    assetTag: row.asset_tag,
    assetName: row.asset_name,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    owner: row.owner,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertAssetBelongsToProject(
  projectId: string,
  assetId: string | null,
): Promise<void> {
  if (!assetId) {
    return;
  }

  const database = await getDatabase();

  const rows = await database.select<{ id: string }[]>(
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

async function getIssueById(issueId: string): Promise<Issue> {
  const database = await getDatabase();

  const rows = await database.select<IssueRow[]>(
    `
      SELECT
        issues.id,
        issues.project_id,
        issues.asset_id,
        assets.tag AS asset_tag,
        assets.name AS asset_name,
        issues.title,
        issues.description,
        issues.priority,
        issues.status,
        issues.owner,
        issues.due_date,
        issues.created_at,
        issues.updated_at
      FROM issues
      LEFT JOIN assets
        ON assets.id = issues.asset_id
      WHERE issues.id = $1
      LIMIT 1
    `,
    [issueId],
  );

  const row = rows[0];

  if (!row) {
    throw new Error("Issue not found.");
  }

  return mapIssueRow(row);
}

export async function listIssuesByProject(
  projectId: string,
): Promise<Issue[]> {
  const database = await getDatabase();

  const rows = await database.select<IssueRow[]>(
    `
      SELECT
        issues.id,
        issues.project_id,
        issues.asset_id,
        assets.tag AS asset_tag,
        assets.name AS asset_name,
        issues.title,
        issues.description,
        issues.priority,
        issues.status,
        issues.owner,
        issues.due_date,
        issues.created_at,
        issues.updated_at
      FROM issues
      LEFT JOIN assets
        ON assets.id = issues.asset_id
      WHERE issues.project_id = $1
      ORDER BY
        CASE issues.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        issues.updated_at DESC
    `,
    [projectId],
  );

  return rows.map(mapIssueRow);
}

export async function createIssue(
  projectId: string,
  input: IssueInput,
): Promise<Issue> {
  const title = input.title.trim();

  if (!title) {
    throw new Error("Issue title is required.");
  }

  await assertAssetBelongsToProject(
    projectId,
    input.assetId,
  );

  const database = await getDatabase();
  const timestamp = new Date().toISOString();
  const issueId = crypto.randomUUID();

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
        $6,
        $7,
        $8,
        $9,
        $10,
        $11
      )
    `,
    [
      issueId,
      projectId,
      input.assetId,
      title,
      input.description.trim(),
      input.priority,
      input.status,
      input.owner.trim(),
      input.dueDate,
      timestamp,
      timestamp,
    ],
  );

  return getIssueById(issueId);
}

export async function updateIssue(
  issueId: string,
  input: IssueInput,
): Promise<Issue> {
  const existingIssue = await getIssueById(issueId);
  const title = input.title.trim();

  if (!title) {
    throw new Error("Issue title is required.");
  }

  await assertAssetBelongsToProject(
    existingIssue.projectId,
    input.assetId,
  );

  const database = await getDatabase();
  const updatedAt = new Date().toISOString();

  await database.execute(
    `
      UPDATE issues
      SET
        asset_id = $1,
        title = $2,
        description = $3,
        priority = $4,
        status = $5,
        owner = $6,
        due_date = $7,
        updated_at = $8
      WHERE id = $9
    `,
    [
      input.assetId,
      title,
      input.description.trim(),
      input.priority,
      input.status,
      input.owner.trim(),
      input.dueDate,
      updatedAt,
      issueId,
    ],
  );

  return getIssueById(issueId);
}

export async function resolveIssue(
  issueId: string,
): Promise<Issue> {
  await getIssueById(issueId);

  const database = await getDatabase();
  const updatedAt = new Date().toISOString();

  await database.execute(
    `
      UPDATE issues
      SET
        status = 'resolved',
        updated_at = $1
      WHERE id = $2
    `,
    [updatedAt, issueId],
  );

  return getIssueById(issueId);
}

export async function reopenIssue(
  issueId: string,
): Promise<Issue> {
  await getIssueById(issueId);

  const database = await getDatabase();
  const updatedAt = new Date().toISOString();

  await database.execute(
    `
      UPDATE issues
      SET
        status = 'open',
        updated_at = $1
      WHERE id = $2
    `,
    [updatedAt, issueId],
  );

  return getIssueById(issueId);
}

export async function deleteIssue(
  issueId: string,
): Promise<void> {
  const database = await getDatabase();

  await getIssueById(issueId);

  await database.execute(
    `
      DELETE FROM issues
      WHERE id = $1
    `,
    [issueId],
  );
}