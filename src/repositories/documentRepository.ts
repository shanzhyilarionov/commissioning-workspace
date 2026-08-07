import { invoke } from "@tauri-apps/api/core";

import { getDatabase } from "../services/database";
import type {
  ImportedProjectDocumentFile,
  ProjectDocument,
  ProjectDocumentInput,
  DocumentCategory,
  DocumentStatus,
} from "../types/document";

interface ProjectDocumentRow {
  id: string;
  project_id: string;
  asset_id: string | null;
  title: string;
  category: DocumentCategory;
  revision: string;
  status: DocumentStatus;
  original_file_name: string;
  stored_path: string;
  mime_type: string;
  file_size: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

function mapProjectDocumentRow(
  row: ProjectDocumentRow,
): ProjectDocument {
  return {
    id: row.id,
    projectId: row.project_id,
    assetId: row.asset_id,
    title: row.title,
    category: row.category,
    revision: row.revision,
    status: row.status,
    originalFileName: row.original_file_name,
    storedPath: row.stored_path,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getProjectDocumentById(
  documentId: string,
): Promise<ProjectDocument> {
  const database = await getDatabase();
  const rows = await database.select<ProjectDocumentRow[]>(
    `
      SELECT
        id,
        project_id,
        asset_id,
        title,
        category,
        revision,
        status,
        original_file_name,
        stored_path,
        mime_type,
        file_size,
        notes,
        created_at,
        updated_at
      FROM project_documents
      WHERE id = $1
      LIMIT 1
    `,
    [documentId],
  );

  const row = rows[0];

  if (!row) {
    throw new Error("Document not found.");
  }

  return mapProjectDocumentRow(row);
}

export async function listDocumentsByProject(
  projectId: string,
): Promise<ProjectDocument[]> {
  const database = await getDatabase();
  const rows = await database.select<ProjectDocumentRow[]>(
    `
      SELECT
        id,
        project_id,
        asset_id,
        title,
        category,
        revision,
        status,
        original_file_name,
        stored_path,
        mime_type,
        file_size,
        notes,
        created_at,
        updated_at
      FROM project_documents
      WHERE project_id = $1
      ORDER BY updated_at DESC, title COLLATE NOCASE ASC
    `,
    [projectId],
  );

  return rows.map(mapProjectDocumentRow);
}

export async function createProjectDocument(
  projectId: string,
  sourcePath: string,
  input: ProjectDocumentInput,
): Promise<ProjectDocument> {
  const database = await getDatabase();
  const documentId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const importedFile =
    await invoke<ImportedProjectDocumentFile>(
      "import_project_document",
      {
        sourcePath,
        projectId,
        documentId,
      },
    );

  try {
    await database.execute(
      `
        INSERT INTO project_documents (
          id,
          project_id,
          asset_id,
          title,
          category,
          revision,
          status,
          original_file_name,
          stored_path,
          mime_type,
          file_size,
          notes,
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
          $12,
          $13,
          $14
        )
      `,
      [
        documentId,
        projectId,
        input.assetId,
        input.title,
        input.category,
        input.revision,
        input.status,
        importedFile.originalFileName,
        importedFile.storedPath,
        importedFile.mimeType,
        importedFile.fileSize,
        input.notes,
        timestamp,
        timestamp,
      ],
    );
  } catch (error) {
    try {
      await invoke("delete_project_document_file", {
        storedPath: importedFile.storedPath,
      });
    } catch {
    }

    throw error;
  }

  return getProjectDocumentById(documentId);
}

export async function updateProjectDocument(
  documentId: string,
  input: ProjectDocumentInput,
): Promise<ProjectDocument> {
  const database = await getDatabase();
  await getProjectDocumentById(documentId);
  const updatedAt = new Date().toISOString();

  await database.execute(
    `
      UPDATE project_documents
      SET
        asset_id = $1,
        title = $2,
        category = $3,
        revision = $4,
        status = $5,
        notes = $6,
        updated_at = $7
      WHERE id = $8
    `,
    [
      input.assetId,
      input.title,
      input.category,
      input.revision,
      input.status,
      input.notes,
      updatedAt,
      documentId,
    ],
  );

  return getProjectDocumentById(documentId);
}

export async function deleteProjectDocument(
  document: ProjectDocument,
): Promise<void> {
  const database = await getDatabase();

  await getProjectDocumentById(document.id);

  const result = await database.execute(
    `
      DELETE FROM project_documents
      WHERE id = $1
    `,
    [document.id],
  );

  if (result.rowsAffected !== 1) {
    throw new Error("The document record could not be deleted.");
  }

  try {
    await invoke("delete_project_document_file", {
      storedPath: document.storedPath,
    });
  } catch (error) {
    console.error(
      "The document record was deleted, but managed file cleanup failed:",
      error,
    );
  }
}