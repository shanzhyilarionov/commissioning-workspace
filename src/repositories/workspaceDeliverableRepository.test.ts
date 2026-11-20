import { createRequire } from "node:module";
import initSqlJs, { type Database } from "sql.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("../services/database", () => ({ getDatabase: mocks.getDatabase }));

import { listWorkspaceDeliverables } from "./workspaceDeliverableRepository";

const require = createRequire(import.meta.url);
let database: Database;

beforeEach(async () => {
  const SQL = await initSqlJs({
    locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
  });
  database = new SQL.Database();
  database.run(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, status TEXT);
    CREATE TABLE assets (
      id TEXT PRIMARY KEY, tag TEXT, subsystem_id TEXT, status TEXT
    );
    CREATE TABLE project_documents (
      id TEXT PRIMARY KEY, project_id TEXT, asset_id TEXT,
      title TEXT, status TEXT, required_for_readiness INTEGER,
      revision TEXT DEFAULT ''
    );
    CREATE TABLE test_records (
      id TEXT PRIMARY KEY, project_id TEXT, asset_id TEXT,
      title TEXT, signed_off_at TEXT
    );
    CREATE TABLE systems (id TEXT PRIMARY KEY, project_id TEXT, code TEXT, name TEXT);
    CREATE TABLE test_items (
      id TEXT PRIMARY KEY, test_record_id TEXT, result TEXT
    );
    CREATE TABLE subsystems (
      id TEXT PRIMARY KEY, system_id TEXT, code TEXT, name TEXT, commissioning_stage TEXT
    );
    INSERT INTO projects VALUES ('active', 'North', 'active'), ('archived', 'South', 'archived');
    INSERT INTO assets (id, tag) VALUES ('asset', 'P-101');
  `);
  mocks.getDatabase.mockResolvedValue({
    select: (query: string, values: (string | null)[] = []) => {
      const statement = database.prepare(query);
      statement.bind(Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value])));
      const rows = [];
      try {
        while (statement.step()) rows.push(statement.getAsObject());
      } finally {
        statement.free();
      }
      return Promise.resolve(rows);
    },
  });
});

afterEach(() => {
  database.close();
  vi.clearAllMocks();
});

describe("workspace deliverables", () => {
  it("scopes each workstream to the selected project while preserving workspace totals", async () => {
    database.run(`
      INSERT INTO systems VALUES
        ('system', 'active', 'SYS', 'System'),
        ('other-system', 'archived', 'OTHER', 'Other system');
      INSERT INTO project_documents (id, project_id, title, status, required_for_readiness) VALUES
        ('required', 'active', 'Required drawing', 'approved', 1),
        ('optional', 'active', 'Optional drawing', 'approved', 0),
        ('other-document', 'archived', 'Other drawing', 'draft', 1);
      INSERT INTO test_records VALUES
        ('record', 'active', NULL, 'Inspection', NULL),
        ('other-record', 'archived', NULL, 'Other inspection', NULL);
      INSERT INTO subsystems VALUES
        ('subsystem', 'system', '01', 'Subsystem', 'handed_over'),
        ('other-subsystem', 'other-system', '02', 'Other subsystem', 'not_started');
    `);

    for (const [kind, id] of [
      ["required_documents", "required"],
      ["test_records", "record"],
      ["subsystem_handover", "subsystem"],
    ] as const) {
      expect(await listWorkspaceDeliverables(kind, "active")).toMatchObject([
        { id, projectId: "active" },
      ]);
      expect(await listWorkspaceDeliverables(kind)).toHaveLength(2);
      expect(await listWorkspaceDeliverables(kind, "missing")).toEqual([]);
    }
  });

  it("includes all required document statuses and archived projects, excluding optional documents", async () => {
    database.run(`
      INSERT INTO project_documents (id, project_id, asset_id, title, status, required_for_readiness) VALUES
        ('draft', 'active', 'asset', 'Draft drawing', 'draft', 1),
        ('review', 'active', NULL, 'Review drawing', 'for_review', 1),
        ('approved', 'archived', NULL, 'Approved drawing', 'approved', 1),
        ('superseded', 'archived', NULL, 'Old drawing', 'superseded', 1),
        ('optional', 'active', NULL, 'Optional drawing', 'approved', 0);
      UPDATE project_documents SET revision = 'C' WHERE id = 'approved';
    `);

    const items = await listWorkspaceDeliverables("required_documents");

    expect(items).toHaveLength(4);
    expect(items.filter((item) => item.status === "approved").map((item) => item.id)).toEqual(["approved"]);
    expect(items.find((item) => item.id === "draft")).toMatchObject({
      kind: "required_documents", context: "P-101", revision: "",
    });
    expect(items.find((item) => item.id === "approved")).toMatchObject({
      projectId: "archived", projectName: "South", context: "", revision: "C",
    });
  });

  it("counts a test record as ready only when its signoff timestamp is nonblank", async () => {
    database.run(`
      INSERT INTO test_records VALUES
        ('null', 'active', NULL, 'No signoff', NULL),
        ('empty', 'active', 'asset', 'Empty signoff', ''),
        ('whitespace', 'archived', NULL, 'Blank signoff', '   '),
        ('signed', 'archived', NULL, 'Signed record', '2026-11-19T12:00:00Z');
    `);

    const items = await listWorkspaceDeliverables("test_records");

    expect(items).toHaveLength(4);
    expect(items.filter((item) => item.status === "signed_off").map((item) => item.id)).toEqual(["signed"]);
    expect(items.filter((item) => item.status === "unsigned")).toHaveLength(3);
  });

  it("includes every handover stage and preserves the subsystem's project and parent system", async () => {
    database.run(`
      INSERT INTO systems VALUES ('system', 'archived', 'ELEC', 'Electrical');
      INSERT INTO subsystems VALUES
        ('new', 'system', '01', 'New', 'not_started'),
        ('progress', 'system', '02', 'In progress', 'in_progress'),
        ('ready', 'system', '03', 'Ready', 'ready'),
        ('commissioned', 'system', '04', 'Commissioned', 'commissioned'),
        ('handed', 'system', '05', 'Handed over', 'handed_over');
    `);

    const items = await listWorkspaceDeliverables("subsystem_handover");

    expect(items).toHaveLength(5);
    expect(items.map((item) => item.status)).toEqual([
      "not_started", "in_progress", "ready", "commissioned", "handed_over",
    ]);
    expect(items[0]).toMatchObject({
      projectId: "archived", projectName: "South", parentId: "system",
      kind: "subsystem_handover", title: "01 - New", context: "ELEC - Electrical",
      completedCount: 0, totalCount: 0,
    });
  });

  it("counts assessed test items per record, including failed and not applicable results", async () => {
    database.run(`
      INSERT INTO test_records VALUES
        ('record', 'active', NULL, 'Inspection', NULL),
        ('empty', 'archived', NULL, 'Empty inspection', NULL);
      INSERT INTO test_items VALUES
        ('pass', 'record', 'pass'),
        ('fail', 'record', 'fail'),
        ('na', 'record', 'not_applicable'),
        ('pending', 'record', 'pending'),
        ('unrelated', 'other-record', 'pass');
    `);

    const items = await listWorkspaceDeliverables("test_records");

    expect(items.find((item) => item.id === "record")).toMatchObject({
      kind: "test_records", completedCount: 3, totalCount: 4,
    });
    expect(items.find((item) => item.id === "empty")).toMatchObject({
      completedCount: 0, totalCount: 0,
    });
  });

  it("counts only completed assets within each subsystem", async () => {
    database.run(`
      INSERT INTO systems VALUES ('system', 'active', 'SYS', 'System');
      INSERT INTO subsystems VALUES
        ('sub', 'system', '01', 'Subsystem', 'in_progress'),
        ('empty', 'system', '02', 'Empty subsystem', 'not_started');
      INSERT INTO assets VALUES
        ('done', 'A-1', 'sub', 'completed'),
        ('progress', 'A-2', 'sub', 'in_progress'),
        ('blocked', 'A-3', 'sub', 'blocked'),
        ('other', 'A-4', 'other-subsystem', 'completed');
    `);

    const items = await listWorkspaceDeliverables("subsystem_handover");

    expect(items.find((item) => item.id === "sub")).toMatchObject({
      kind: "subsystem_handover", completedCount: 1, totalCount: 3,
    });
    expect(items.find((item) => item.id === "empty")).toMatchObject({
      completedCount: 0, totalCount: 0,
    });
  });

  it("returns an empty list when a workstream has no entries", async () => {
    for (const kind of ["required_documents", "test_records", "subsystem_handover"] as const) {
      expect(await listWorkspaceDeliverables(kind)).toEqual([]);
    }
  });
});
