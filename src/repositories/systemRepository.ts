import { getDatabase } from "../services/database";
import type {
  CommissioningSystem,
  Subsystem,
  SubsystemInput,
  SystemInput,
} from "../types/system";

interface SystemRow {
  id: string;
  project_id: string;
  code: string;
  name: string;
  description: string;
  commissioning_stage: CommissioningSystem["stage"];
  created_at: string;
  updated_at: string;
}

interface SubsystemRow {
  id: string;
  system_id: string;
  code: string;
  name: string;
  description: string;
  commissioning_stage: Subsystem["stage"];
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
    stage: row.commissioning_stage,
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
    stage: row.commissioning_stage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeStructureInput(input: SystemInput): SystemInput {
  return {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    description: input.description.trim(),
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
        commissioning_stage,
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
        commissioning_stage,
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
        commissioning_stage,
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
        commissioning_stage,
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

async function assertSystemInputAvailable(
  projectId: string,
  input: SystemInput,
  excludedSystemId?: string,
): Promise<void> {
  const database = await getDatabase();
  const parameters = excludedSystemId
    ? [projectId, input.name, excludedSystemId]
    : [projectId, input.name];
  const nameRows = await database.select<{ id: string }[]>(
    excludedSystemId
      ? `
          SELECT id
          FROM systems
          WHERE project_id = $1
            AND name = $2 COLLATE NOCASE
            AND id <> $3
          LIMIT 1
        `
      : `
          SELECT id
          FROM systems
          WHERE project_id = $1
            AND name = $2 COLLATE NOCASE
          LIMIT 1
        `,
    parameters,
  );

  if (nameRows.length > 0) {
    throw new Error(`System name "${input.name}" already exists in this project.`);
  }

  if (!input.code) {
    return;
  }

  const codeParameters = excludedSystemId
    ? [projectId, input.code, excludedSystemId]
    : [projectId, input.code];
  const codeRows = await database.select<{ id: string }[]>(
    excludedSystemId
      ? `
          SELECT id
          FROM systems
          WHERE project_id = $1
            AND upper(code) = upper($2)
            AND id <> $3
          LIMIT 1
        `
      : `
          SELECT id
          FROM systems
          WHERE project_id = $1
            AND upper(code) = upper($2)
          LIMIT 1
        `,
    codeParameters,
  );

  if (codeRows.length > 0) {
    throw new Error(`System code "${input.code}" already exists in this project.`);
  }
}

async function assertSubsystemInputAvailable(
  systemId: string,
  input: SubsystemInput,
  excludedSubsystemId?: string,
): Promise<void> {
  const database = await getDatabase();
  const parameters = excludedSubsystemId
    ? [systemId, input.name, excludedSubsystemId]
    : [systemId, input.name];
  const nameRows = await database.select<{ id: string }[]>(
    excludedSubsystemId
      ? `
          SELECT id
          FROM subsystems
          WHERE system_id = $1
            AND name = $2 COLLATE NOCASE
            AND id <> $3
          LIMIT 1
        `
      : `
          SELECT id
          FROM subsystems
          WHERE system_id = $1
            AND name = $2 COLLATE NOCASE
          LIMIT 1
        `,
    parameters,
  );

  if (nameRows.length > 0) {
    throw new Error(`Subsystem name "${input.name}" already exists in this system.`);
  }

  if (!input.code) {
    return;
  }

  const codeParameters = excludedSubsystemId
    ? [systemId, input.code, excludedSubsystemId]
    : [systemId, input.code];
  const codeRows = await database.select<{ id: string }[]>(
    excludedSubsystemId
      ? `
          SELECT id
          FROM subsystems
          WHERE system_id = $1
            AND upper(code) = upper($2)
            AND id <> $3
          LIMIT 1
        `
      : `
          SELECT id
          FROM subsystems
          WHERE system_id = $1
            AND upper(code) = upper($2)
          LIMIT 1
        `,
    codeParameters,
  );

  if (codeRows.length > 0) {
    throw new Error(`Subsystem code "${input.code}" already exists in this system.`);
  }
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
        commissioning_stage,
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
        subsystems.commissioning_stage,
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

  const existingSystem = await findSystemByName(projectId, normalizedName);

  if (existingSystem) {
    return existingSystem;
  }

  return createSystemDetails(projectId, {
    code: "",
    name: normalizedName,
    description: "",
  });
}

export async function createSystemDetails(
  projectId: string,
  input: SystemInput,
): Promise<CommissioningSystem> {
  const normalizedInput = normalizeStructureInput(input);

  if (!normalizedInput.name) {
    throw new Error("System name is required.");
  }

  await assertSystemInputAvailable(projectId, normalizedInput);

  const database = await getDatabase();
  const timestamp = new Date().toISOString();
  const system: CommissioningSystem = {
    id: crypto.randomUUID(),
    projectId,
    code: normalizedInput.code,
    name: normalizedInput.name,
    description: normalizedInput.description,
    stage: "not_started",
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

export async function updateSystem(
  systemId: string,
  input: SystemInput,
): Promise<CommissioningSystem> {
  const existingSystem = await getSystemById(systemId);

  if (!existingSystem) {
    throw new Error("System not found.");
  }

  const normalizedInput = normalizeStructureInput(input);

  if (!normalizedInput.name) {
    throw new Error("System name is required.");
  }

  await assertSystemInputAvailable(
    existingSystem.projectId,
    normalizedInput,
    systemId,
  );

  const database = await getDatabase();
  const updatedAt = new Date().toISOString();

  await database.execute(
    `
      UPDATE systems
      SET
        code = $1,
        name = $2,
        description = $3,
        updated_at = $4
      WHERE id = $5
    `,
    [
      normalizedInput.code,
      normalizedInput.name,
      normalizedInput.description,
      updatedAt,
      systemId,
    ],
  );

  const updatedSystem = await getSystemById(systemId);

  if (!updatedSystem) {
    throw new Error("System not found after update.");
  }

  return updatedSystem;
}

export async function deleteSystem(systemId: string): Promise<void> {
  const existingSystem = await getSystemById(systemId);

  if (!existingSystem) {
    return;
  }

  const database = await getDatabase();

  await database.execute(
    `
      UPDATE assets
      SET system_name = ''
      WHERE system_id = $1
    `,
    [systemId],
  );

  await database.execute(
    `
      DELETE FROM systems
      WHERE id = $1
    `,
    [systemId],
  );
}

export async function createSubsystem(
  systemId: string,
  name: string,
): Promise<Subsystem> {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("Subsystem name is required.");
  }

  const existingSubsystem = await findSubsystemByName(systemId, normalizedName);

  if (existingSubsystem) {
    return existingSubsystem;
  }

  return createSubsystemDetails(systemId, {
    code: "",
    name: normalizedName,
    description: "",
  });
}

export async function createSubsystemDetails(
  systemId: string,
  input: SubsystemInput,
): Promise<Subsystem> {
  const system = await getSystemById(systemId);

  if (!system) {
    throw new Error("System not found.");
  }

  const normalizedInput = normalizeStructureInput(input);

  if (!normalizedInput.name) {
    throw new Error("Subsystem name is required.");
  }

  await assertSubsystemInputAvailable(systemId, normalizedInput);

  const database = await getDatabase();
  const timestamp = new Date().toISOString();
  const subsystem: Subsystem = {
    id: crypto.randomUUID(),
    systemId,
    code: normalizedInput.code,
    name: normalizedInput.name,
    description: normalizedInput.description,
    stage: "not_started",
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

export async function updateSubsystem(
  subsystemId: string,
  input: SubsystemInput,
): Promise<Subsystem> {
  const existingSubsystem = await getSubsystemById(subsystemId);

  if (!existingSubsystem) {
    throw new Error("Subsystem not found.");
  }

  const normalizedInput = normalizeStructureInput(input);

  if (!normalizedInput.name) {
    throw new Error("Subsystem name is required.");
  }

  await assertSubsystemInputAvailable(
    existingSubsystem.systemId,
    normalizedInput,
    subsystemId,
  );

  const database = await getDatabase();
  const updatedAt = new Date().toISOString();

  await database.execute(
    `
      UPDATE subsystems
      SET
        code = $1,
        name = $2,
        description = $3,
        updated_at = $4
      WHERE id = $5
    `,
    [
      normalizedInput.code,
      normalizedInput.name,
      normalizedInput.description,
      updatedAt,
      subsystemId,
    ],
  );

  const updatedSubsystem = await getSubsystemById(subsystemId);

  if (!updatedSubsystem) {
    throw new Error("Subsystem not found after update.");
  }

  return updatedSubsystem;
}

export async function deleteSubsystem(subsystemId: string): Promise<void> {
  const database = await getDatabase();

  await database.execute(
    `
      DELETE FROM subsystems
      WHERE id = $1
    `,
    [subsystemId],
  );
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
