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

describe("audit migration", () => {
  it("records changes and preserves signed test record revisions", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const database = new SQL.Database();

    database.run(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE systems (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        commissioning_stage TEXT NOT NULL
      );
      CREATE TABLE subsystems (
        id TEXT PRIMARY KEY,
        system_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        commissioning_stage TEXT NOT NULL
      );
      CREATE TABLE assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE issues (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE test_records (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        asset_id TEXT,
        title TEXT NOT NULL,
        record_type TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        executed_by TEXT NOT NULL DEFAULT '',
        witnessed_by TEXT NOT NULL DEFAULT '',
        execution_date TEXT,
        signed_off_by TEXT NOT NULL DEFAULT '',
        signed_off_at TEXT,
        completion_notes TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE test_items (
        id TEXT PRIMARY KEY,
        test_record_id TEXT NOT NULL,
        description TEXT NOT NULL,
        result TEXT NOT NULL
      );
      CREATE TABLE project_documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        revision TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE turnover_packages (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        package_number TEXT NOT NULL,
        revision TEXT NOT NULL,
        status TEXT NOT NULL,
        scope_name TEXT NOT NULL,
        prepared_by TEXT NOT NULL,
        void_reason TEXT NOT NULL DEFAULT ''
      );

      INSERT INTO projects VALUES ('project-1', 'Plant', 'active');
    `);

    database.run(readMigration(12));
    database.run(`
      UPDATE workspace_settings
      SET value = 'Morgan Lee'
      WHERE key = 'current_operator';

      INSERT INTO assets
      VALUES ('asset-1', 'project-1', 'P-101', 'Feed Pump', 'not_started');

      UPDATE assets
      SET status = 'completed'
      WHERE id = 'asset-1';

      INSERT INTO test_records
      VALUES (
        'record-1',
        'project-1',
        'asset-1',
        'Pump run test',
        'functional_test',
        '',
        'Morgan Lee',
        '',
        '2026-08-14',
        '',
        NULL,
        ''
      );

      UPDATE audit_operation_context
      SET
        action = 'signed',
        actor = 'Alex Chen',
        reason = 'Accepted after witness review'
      WHERE id = 1;

      UPDATE test_records
      SET
        signed_off_by = 'Alex Chen',
        signed_off_at = '2026-08-14T20:00:00.000Z'
      WHERE id = 'record-1';

      INSERT INTO test_record_revisions (
        id,
        project_id,
        test_record_id,
        revision_number,
        snapshot_json,
        reopened_by,
        reopen_reason,
        created_at
      )
      VALUES (
        'revision-1',
        'project-1',
        'record-1',
        1,
        '{"record":{"id":"record-1"},"items":[]}',
        'Morgan Lee',
        'Correct instrument range',
        '2026-08-14T21:00:00.000Z'
      );
    `);

    const assetEvents = database.exec(`
      SELECT action, actor
      FROM audit_events
      WHERE entity_id = 'asset-1'
      ORDER BY created_at, rowid;
    `);
    expect(assetEvents[0]?.values).toEqual([
      ["created", "Morgan Lee"],
      ["status_changed", "Morgan Lee"],
    ]);

    const signEvent = database.exec(`
      SELECT action, actor, reason
      FROM audit_events
      WHERE entity_id = 'record-1'
        AND action = 'signed';
    `);
    expect(signEvent[0]?.values[0]).toEqual([
      "signed",
      "Alex Chen",
      "Accepted after witness review",
    ]);

    const revision = database.exec(`
      SELECT revision_number, reopened_by, reopen_reason
      FROM test_record_revisions
      WHERE id = 'revision-1';
    `);
    expect(revision[0]?.values[0]).toEqual([
      1,
      "Morgan Lee",
      "Correct instrument range",
    ]);

    database.close();
  });
});
