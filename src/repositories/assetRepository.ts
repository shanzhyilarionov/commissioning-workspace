import { getDatabase } from "../services/database";
import { resolveAssetStructure } from "./systemRepository";
import type {
  Asset,
  AssetInput,
  AssetStatus,
} from "../types/asset";

interface AssetRow {
  id: string;
  project_id: string;
  system_id: string | null;
  subsystem_id: string | null;
  system_name: string;
  subsystem_name: string;
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
    systemId: row.system_id,
    subsystemId: row.subsystem_id,
    systemName: row.system_name,
    subsystemName: row.subsystem_name,
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
        assets.id,
        assets.project_id,
        assets.system_id,
        assets.subsystem_id,
        COALESCE(systems.name, assets.system_name) AS system_name,
        COALESCE(subsystems.name, '') AS subsystem_name,
        assets.tag,
        assets.name,
        assets.asset_type,
        assets.status,
        assets.description,
        assets.created_at,
        assets.updated_at
      FROM assets
      LEFT JOIN systems
        ON systems.id = assets.system_id
      LEFT JOIN subsystems
        ON subsystems.id = assets.subsystem_id
      WHERE assets.id = $1
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
        assets.id,
        assets.project_id,
        assets.system_id,
        assets.subsystem_id,
        COALESCE(systems.name, assets.system_name) AS system_name,
        COALESCE(subsystems.name, '') AS subsystem_name,
        assets.tag,
        assets.name,
        assets.asset_type,
        assets.status,
        assets.description,
        assets.created_at,
        assets.updated_at
      FROM assets
      LEFT JOIN systems
        ON systems.id = assets.system_id
      LEFT JOIN subsystems
        ON subsystems.id = assets.subsystem_id
      WHERE assets.project_id = $1
      ORDER BY
        COALESCE(systems.name, assets.system_name) COLLATE NOCASE,
        COALESCE(subsystems.name, '') COLLATE NOCASE,
        assets.tag COLLATE NOCASE
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

  const { system, subsystem } = await resolveAssetStructure(
    projectId,
    input.systemId,
    input.systemName,
    input.subsystemId,
    input.subsystemName,
  );

  const database = await getDatabase();
  const timestamp = new Date().toISOString();
  const asset: Asset = {
    id: crypto.randomUUID(),
    projectId,
    systemId: system?.id ?? null,
    subsystemId: subsystem?.id ?? null,
    systemName: system?.name ?? "",
    subsystemName: subsystem?.name ?? "",
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
        system_id,
        subsystem_id,
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
        $10,
        $11,
        $12
      )
    `,
    [
      asset.id,
      asset.projectId,
      asset.systemId,
      asset.subsystemId,
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

  const { system, subsystem } = await resolveAssetStructure(
    existingAsset.projectId,
    input.systemId,
    input.systemName,
    input.subsystemId,
    input.subsystemName,
  );

  const database = await getDatabase();
  const updatedAt = new Date().toISOString();

  await database.execute(
    `
      UPDATE assets
      SET
        system_id = $1,
        subsystem_id = $2,
        system_name = $3,
        tag = $4,
        name = $5,
        asset_type = $6,
        status = $7,
        description = $8,
        updated_at = $9
      WHERE id = $10
    `,
    [
      system?.id ?? null,
      subsystem?.id ?? null,
      system?.name ?? "",
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
    systemId: system?.id ?? null,
    subsystemId: subsystem?.id ?? null,
    systemName: system?.name ?? "",
    subsystemName: subsystem?.name ?? "",
    tag: input.tag,
    name: input.name,
    assetType: input.assetType,
    status: input.status,
    description: input.description,
    updatedAt,
  };
}

export async function deleteAsset(assetId: string): Promise<void> {
  const database = await getDatabase();

  await getAssetById(assetId);

  await database.execute(
    `
      DELETE FROM assets
      WHERE id = $1
    `,
    [assetId],
  );
}
