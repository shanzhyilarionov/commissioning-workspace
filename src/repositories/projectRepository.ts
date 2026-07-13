import { getDatabase } from "../services/database";
import type {
  CreateProjectInput,
  Project,
  ProjectStatus,
  UpdateProjectInput,
} from "../types/project";

interface ProjectRow {
  id: string;
  name: string;
  client: string;
  location: string;
  description: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

function mapProjectRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    client: row.client,
    location: row.location,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getProjectById(
  projectId: string,
): Promise<Project> {
  const database = await getDatabase();

  const rows = await database.select<ProjectRow[]>(
    `
      SELECT
        id,
        name,
        client,
        location,
        description,
        status,
        created_at,
        updated_at
      FROM projects
      WHERE id = $1
      LIMIT 1
    `,
    [projectId],
  );

  const row = rows[0];

  if (!row) {
    throw new Error("Project not found.");
  }

  return mapProjectRow(row);
}

async function changeProjectStatus(
  projectId: string,
  status: ProjectStatus,
): Promise<Project> {
  const database = await getDatabase();
  const existingProject = await getProjectById(projectId);

  if (existingProject.status === status) {
    return existingProject;
  }

  const updatedAt = new Date().toISOString();

  await database.execute(
    `
      UPDATE projects
      SET
        status = $1,
        updated_at = $2
      WHERE id = $3
    `,
    [status, updatedAt, projectId],
  );

  return {
    ...existingProject,
    status,
    updatedAt,
  };
}

export async function listProjects(): Promise<Project[]> {
  const database = await getDatabase();

  const rows = await database.select<ProjectRow[]>(`
    SELECT
      id,
      name,
      client,
      location,
      description,
      status,
      created_at,
      updated_at
    FROM projects
    ORDER BY updated_at DESC
  `);

  return rows.map(mapProjectRow);
}

export async function createProject(
  input: CreateProjectInput,
): Promise<Project> {
  const database = await getDatabase();
  const timestamp = new Date().toISOString();

  const project: Project = {
    id: crypto.randomUUID(),
    name: input.name,
    client: input.client,
    location: input.location,
    description: input.description,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.execute(
    `
      INSERT INTO projects (
        id,
        name,
        client,
        location,
        description,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      project.id,
      project.name,
      project.client,
      project.location,
      project.description,
      project.status,
      project.createdAt,
      project.updatedAt,
    ],
  );

  return project;
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
): Promise<Project> {
  const database = await getDatabase();
  const existingProject = await getProjectById(projectId);
  const updatedAt = new Date().toISOString();

  await database.execute(
    `
      UPDATE projects
      SET
        name = $1,
        client = $2,
        location = $3,
        description = $4,
        status = $5,
        updated_at = $6
      WHERE id = $7
    `,
    [
      input.name,
      input.client,
      input.location,
      input.description,
      input.status,
      updatedAt,
      projectId,
    ],
  );

  return {
    ...existingProject,
    name: input.name,
    client: input.client,
    location: input.location,
    description: input.description,
    status: input.status,
    updatedAt,
  };
}

export async function archiveProject(
  projectId: string,
): Promise<Project> {
  return changeProjectStatus(projectId, "archived");
}

export async function restoreProject(
  projectId: string,
): Promise<Project> {
  return changeProjectStatus(projectId, "active");
}