import { getDatabase } from "../services/database";
import type {
  CommissioningSystem,
  Subsystem,
} from "../types/system";

interface SystemRow {
  id: string;
  project_id: string;
  code: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface SubsystemRow {
  id: string;
  system_id: string;
  code: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

function mapSystemRow(row: SystemRow): CommissioningSystem {
  return {
    id: row.id,
    projectId: row.project_id,
    code: row.code,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSubsystemRow(row: SubsystemRow): Subsystem {
  return {
    id: row.id,
    systemId: row.system_id,
    code: row.code,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getSystemById(
  systemId: string,
): Promise<CommissioningSystem | null> {
  const database = await getDatabase();
  const rows = await database.select<SystemRow[]>(
    `
      SELECT
        id,
        project_id,
        code,
        name,
        description,
        created_at,
        updated_at
      FROM systems
      WHERE id = $1
      LIMIT 1
    `,
    [systemId],
  );

  return rows[0] ? mapSystemRow(rows[0]) : null;
}

async function getSubsystemById(
  subsystemId: string,
): Promise<Subsystem | null> {
  const database = await getDatabase();
  const rows = await database.select<SubsystemRow[]>(
    `
      SELECT
        id,
        system_id,
        code,
        name,
        description,
        created_at,
        updated_at
      FROM subsystems
      WHERE id = $1
      LIMIT 1
    `,
    [subsystemId],
  );

  return rows[0] ? mapSubsystemRow(rows[0]) : null;
}

async function findSystemByName(
  projectId: string,
  name: string,
): Promise<CommissioningSystem | null> {
  const database = await getDatabase();
  const rows = await database.select<SystemRow[]>(
    `
      SELECT
        id,
        project_id,
        code,
        name,
        description,
        created_at,
        updated_at
      FROM systems
      WHERE project_id = $1
        AND name = $2 COLLATE NOCASE
      LIMIT 1
    `,
    [projectId, name],
  );

  return rows[0] ? mapSystemRow(rows[0]) : null;
}

async function findSubsystemByName(
  systemId: string,
  name: string,
): Promise<Subsystem | null> {
  const database = await getDatabase();
  const rows = await database.select<SubsystemRow[]>(
    `
      SELECT
        id,
        system_id,
        code,
        name,
        description,
        created_at,
        updated_at
      FROM subsystems
      WHERE system_id = $1
        AND name = $2 COLLATE NOCASE
      LIMIT 1
    `,
    [systemId, name],
  );

  return rows[0] ? mapSubsystemRow(rows[0]) : null;
}

export async function listSystemsByProject(
  projectId: string,
): Promise<CommissioningSystem[]> {
  const database = await getDatabase();
  const rows = await database.select<SystemRow[]>(
    `
      SELECT
        id,
        project_id,
        code,
        name,
        description,
        created_at,
        updated_at
      FROM systems
      WHERE project_id = $1
      ORDER BY name COLLATE NOCASE
    `,
    [projectId],
  );

  return rows.map(mapSystemRow);
}

export async function listSubsystemsByProject(
  projectId: string,
): Promise<Subsystem[]> {
  const database = await getDatabase();
  const rows = await database.select<SubsystemRow[]>(
    `
      SELECT
        subsystems.id,
        subsystems.system_id,
        subsystems.code,
        subsystems.name,
        subsystems.description,
        subsystems.created_at,
        subsystems.updated_at
      FROM subsystems
      INNER JOIN systems
        ON systems.id = subsystems.system_id
      WHERE systems.project_id = $1
      ORDER BY
        systems.name COLLATE NOCASE,
        subsystems.name COLLATE NOCASE
    `,
    [projectId],
  );

  return rows.map(mapSubsystemRow);
}

export async function createSystem(
  projectId: string,
  name: string,
): Promise<CommissioningSystem> {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("System name is required.");
  }

  const existingSystem = await findSystemByName(
    projectId,
    normalizedName,
  );

  if (existingSystem) {
    return existingSystem;
  }

  const database = await getDatabase();
  const timestamp = new Date().toISOString();
  const system: CommissioningSystem = {
    id: crypto.randomUUID(),
    projectId,
    code: "",
    name: normalizedName,
    description: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.execute(
    `
      INSERT INTO systems (
        id,
        project_id,
        code,
        name,
        description,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      system.id,
      system.projectId,
      system.code,
      system.name,
      system.description,
      system.createdAt,
      system.updatedAt,
    ],
  );

  return system;
}

export async function createSubsystem(
  systemId: string,
  name: string,
): Promise<Subsystem> {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("Subsystem name is required.");
  }

  const existingSubsystem = await findSubsystemByName(
    systemId,
    normalizedName,
  );

  if (existingSubsystem) {
    return existingSubsystem;
  }

  const database = await getDatabase();
  const timestamp = new Date().toISOString();
  const subsystem: Subsystem = {
    id: crypto.randomUUID(),
    systemId,
    code: "",
    name: normalizedName,
    description: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.execute(
    `
      INSERT INTO subsystems (
        id,
        system_id,
        code,
        name,
        description,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      subsystem.id,
      subsystem.systemId,
      subsystem.code,
      subsystem.name,
      subsystem.description,
      subsystem.createdAt,
      subsystem.updatedAt,
    ],
  );

  return subsystem;
}

export async function resolveAssetStructure(
  projectId: string,
  systemId: string | null,
  systemName: string,
  subsystemId: string | null,
  subsystemName: string,
): Promise<{
  system: CommissioningSystem | null;
  subsystem: Subsystem | null;
}> {
  let system: CommissioningSystem | null = null;

  if (systemId) {
    system = await getSystemById(systemId);

    if (!system || system.projectId !== projectId) {
      throw new Error("The selected system is not available in this project.");
    }
  } else if (systemName.trim()) {
    system = await createSystem(projectId, systemName);
  }

  let subsystem: Subsystem | null = null;

  if (subsystemId) {
    if (!system) {
      throw new Error("Select a system before selecting a subsystem.");
    }

    subsystem = await getSubsystemById(subsystemId);

    if (!subsystem || subsystem.systemId !== system.id) {
      throw new Error("The selected subsystem does not belong to this system.");
    }
  } else if (subsystemName.trim()) {
    if (!system) {
      throw new Error("Select a system before creating a subsystem.");
    }

    subsystem = await createSubsystem(system.id, subsystemName);
  }

  return { system, subsystem };
}
