import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

function readMigration(version: number): string {
  const source = readFileSync(
    new URL("../../src-tauri/src/lib.rs", import.meta.url),
    "utf8",
  );
  const match = source.match(
    new RegExp(
      `version:\\s*${version},[\\s\\S]*?sql:\\s*r#"\\n([\\s\\S]*?)\\n\\s*"#,\\n\\s*kind:\\s*MigrationKind::Up`,
    ),
  );

  if (!match) {
    throw new Error(`Migration ${version} SQL was not found.`);
  }

  return match[1];
}

describe("turnover package migrations", () => {
  it("preserves existing data and adds the void lifecycle", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const database = new SQL.Database();

    database.run(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE projects (
        id TEXT PRIMARY KEY NOT NULL
      );

      CREATE TABLE assets (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE project_documents (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        asset_id TEXT,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other'
          CHECK (
            category IN (
              'drawing',
              'manual',
              'datasheet',
              'procedure',
              'certificate',
              'report',
              'other'
            )
          ),
        revision TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'for_review', 'approved', 'superseded')),
        original_file_name TEXT NOT NULL,
        stored_path TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        file_size INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        required_for_readiness INTEGER NOT NULL DEFAULT 0
          CHECK (required_for_readiness IN (0, 1)),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_project_documents_project_id
        ON project_documents(project_id);
      CREATE INDEX idx_project_documents_project_status
        ON project_documents(project_id, status);
      CREATE INDEX idx_project_documents_project_category
        ON project_documents(project_id, category);
      CREATE INDEX idx_project_documents_asset_id
        ON project_documents(asset_id);
      CREATE INDEX idx_project_documents_required_readiness
        ON project_documents(project_id, required_for_readiness, status);

      INSERT INTO projects (id) VALUES ('project-1');
      INSERT INTO assets (id, project_id) VALUES ('asset-1', 'project-1');
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
        updated_at,
        required_for_readiness
      )
      VALUES (
        'document-1',
        'project-1',
        'asset-1',
        'Existing drawing',
        'drawing',
        'A',
        'approved',
        'drawing.pdf',
        '/managed/drawing.pdf',
        'application/pdf',
        100,
        'Preserve this record',
        '2026-08-01T00:00:00.000Z',
        '2026-08-01T00:00:00.000Z',
        1
      );
    `);

    database.run(readMigration(10));

    const preservedDocument = database.exec(`
      SELECT title, category, revision, status, required_for_readiness
      FROM project_documents
      WHERE id = 'document-1';
    `);

    expect(preservedDocument[0]?.values[0]).toEqual([
      "Existing drawing",
      "drawing",
      "A",
      "approved",
      1,
    ]);

    expect(() =>
      database.run(`
        INSERT INTO project_documents (
          id,
          project_id,
          title,
          category,
          original_file_name,
          stored_path,
          created_at,
          updated_at
        )
        VALUES (
          'document-2',
          'project-1',
          'Commissioning specification',
          'specification',
          'specification.pdf',
          '/managed/specification.pdf',
          '2026-08-02T00:00:00.000Z',
          '2026-08-02T00:00:00.000Z'
        );
      `),
    ).not.toThrow();

    expect(() =>
      database.run(`
        INSERT INTO turnover_packages (
          id,
          project_id,
          scope_kind,
          scope_id,
          scope_name,
          package_number,
          revision,
          status,
          stage_at_generation,
          prepared_by,
          snapshot_json,
          generated_at
        )
        VALUES (
          'package-1',
          'project-1',
          'system',
          'system-1',
          'Electrical',
          'ELEC-TOP-001',
          'A',
          'final',
          'commissioned',
          'Engineer',
          '{}',
          '2026-08-12T00:00:00.000Z'
        );
      `),
    ).not.toThrow();

    database.run(readMigration(11));

    const migratedPackage = database.exec(`
      SELECT status, voided_at, void_reason
      FROM turnover_packages
      WHERE id = 'package-1';
    `);

    expect(migratedPackage[0]?.values[0]).toEqual(["final", null, ""]);

    expect(() =>
      database.run(`
        UPDATE turnover_packages
        SET
          status = 'void',
          voided_at = '2026-08-12T13:00:00.000Z',
          void_reason = 'Issued with an incorrect revision.'
        WHERE id = 'package-1';
      `),
    ).not.toThrow();

    const voidedPackage = database.exec(`
      SELECT status, voided_at, void_reason
      FROM turnover_packages
      WHERE id = 'package-1';
    `);

    expect(voidedPackage[0]?.values[0]).toEqual([
      "void",
      "2026-08-12T13:00:00.000Z",
      "Issued with an incorrect revision.",
    ]);

    expect(() =>
      database.run(`
        UPDATE turnover_packages
        SET status = 'deleted'
        WHERE id = 'package-1';
      `),
    ).toThrow();

    expect(() =>
      database.run(`
        UPDATE turnover_packages
        SET
          status = 'void',
          voided_at = NULL,
          void_reason = ''
        WHERE id = 'package-1';
      `),
    ).toThrow();

    database.close();
  });
});
