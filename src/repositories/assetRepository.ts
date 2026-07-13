import { getDatabase } from "../services/database";
import type {
  Asset,
  AssetInput,
  AssetStatus,
} from "../types/asset";

interface AssetRow {
  id: string;
  project_id: string;
  system_name: string;
  tag: string;
  name: string;
  asset_type: string;
  status: AssetStatus;
  description: string;
  created_at: string;
  updated_at: string;
}

function mapAssetRow(row: AssetRow): Asset {
  return {
    id: row.id,
    projectId: row.project_id,
    systemName: row.system_name,
    tag: row.tag,
    name: row.name,
    assetType: row.asset_type,
    status: row.status,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getAssetById(
  assetId: string,
): Promise<Asset> {
  const database = await getDatabase();

  const rows = await database.select<AssetRow[]>(
    `
      SELECT
        id,
        project_id,
        system_name,
        tag,
        name,
        asset_type,
        status,
        description,
        created_at,
        updated_at
      FROM assets
      WHERE id = $1
      LIMIT 1
    `,
    [assetId],
  );

  const row = rows[0];

  if (!row) {
    throw new Error("Asset not found.");
  }

  return mapAssetRow(row);
}

async function assertTagAvailable(
  projectId: string,
  tag: string,
  excludedAssetId?: string,
): Promise<void> {
  const database = await getDatabase();

  const rows = excludedAssetId
    ? await database.select<{ id: string }[]>(
        `
          SELECT id
          FROM assets
          WHERE project_id = $1
            AND tag = $2
            AND id <> $3
          LIMIT 1
        `,
        [projectId, tag, excludedAssetId],
      )
    : await database.select<{ id: string }[]>(
        `
          SELECT id
          FROM assets
          WHERE project_id = $1
            AND tag = $2
          LIMIT 1
        `,
        [projectId, tag],
      );

  if (rows.length > 0) {
    throw new Error(
      `Asset tag "${tag}" already exists in this project.`,
    );
  }
}

export async function listAssetsByProject(
  projectId: string,
): Promise<Asset[]> {
  const database = await getDatabase();

  const rows = await database.select<AssetRow[]>(
    `
      SELECT
        id,
        project_id,
        system_name,
        tag,
        name,
        asset_type,
        status,
        description,
        created_at,
        updated_at
      FROM assets
      WHERE project_id = $1
      ORDER BY
        system_name COLLATE NOCASE,
        tag COLLATE NOCASE
    `,
    [projectId],
  );

  return rows.map(mapAssetRow);
}

export async function createAsset(
  projectId: string,
  input: AssetInput,
): Promise<Asset> {
  await assertTagAvailable(projectId, input.tag);

  const database = await getDatabase();
  const timestamp = new Date().toISOString();

  const asset: Asset = {
    id: crypto.randomUUID(),
    projectId,
    systemName: input.systemName,
    tag: input.tag,
    name: input.name,
    assetType: input.assetType,
    status: input.status,
    description: input.description,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.execute(
    `
      INSERT INTO assets (
        id,
        project_id,
        system_name,
        tag,
        name,
        asset_type,
        status,
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
        $8,
        $9,
        $10
      )
    `,
    [
      asset.id,
      asset.projectId,
      asset.systemName,
      asset.tag,
      asset.name,
      asset.assetType,
      asset.status,
      asset.description,
      asset.createdAt,
      asset.updatedAt,
    ],
  );

  return asset;
}

export async function updateAsset(
  assetId: string,
  input: AssetInput,
): Promise<Asset> {
  const existingAsset = await getAssetById(assetId);

  await assertTagAvailable(
    existingAsset.projectId,
    input.tag,
    assetId,
  );

  const database = await getDatabase();
  const updatedAt = new Date().toISOString();

  await database.execute(
    `
      UPDATE assets
      SET
        system_name = $1,
        tag = $2,
        name = $3,
        asset_type = $4,
        status = $5,
        description = $6,
        updated_at = $7
      WHERE id = $8
    `,
    [
      input.systemName,
      input.tag,
      input.name,
      input.assetType,
      input.status,
      input.description,
      updatedAt,
      assetId,
    ],
  );

  return {
    ...existingAsset,
    systemName: input.systemName,
    tag: input.tag,
    name: input.name,
    assetType: input.assetType,
    status: input.status,
    description: input.description,
    updatedAt,
  };
}