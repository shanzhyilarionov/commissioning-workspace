import { createRequire } from "node:module";
import initSqlJs, { type Database } from "sql.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("../services/database", () => ({ getDatabase: mocks.getDatabase }));

import { getWorkspaceAnalytics } from "./workspaceAnalyticsRepository";
import { listWorkspaceMetricEntries } from "./workspaceMetricRepository";

const require = createRequire(import.meta.url);
const now = new Date("2026-11-27T12:00:00");
let database: Database;

beforeEach(async () => {
  const SQL = await initSqlJs({
    locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
  });
  database = new SQL.Database();
  database.run(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, name TEXT, status TEXT, updated_at TEXT DEFAULT ''
    );
    CREATE TABLE systems (id TEXT PRIMARY KEY, project_id TEXT, code TEXT, name TEXT);
    CREATE TABLE subsystems (
      id TEXT PRIMARY KEY, system_id TEXT, commissioning_stage TEXT
    );
    CREATE TABLE assets (
      id TEXT PRIMARY KEY, project_id TEXT, system_id TEXT,
      tag TEXT, name TEXT, status TEXT
    );
    CREATE TABLE test_records (
      id TEXT PRIMARY KEY, project_id TEXT, title TEXT, signed_off_at TEXT
    );
    CREATE TABLE test_items (
      id TEXT PRIMARY KEY, test_record_id TEXT, description TEXT,
      result TEXT, sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE issues (
      id TEXT PRIMARY KEY, project_id TEXT, title TEXT,
      priority TEXT, status TEXT, due_date TEXT
    );
    CREATE TABLE project_documents (
      id TEXT PRIMARY KEY, required_for_readiness INTEGER, status TEXT
    );
    CREATE TABLE audit_events (action TEXT, details_json TEXT, created_at TEXT);

    INSERT INTO projects (id, name, status) VALUES
      ('north', 'North', 'active'),
      ('south', 'South', 'active'),
      ('calm', 'Calm', 'active'),
      ('old', 'Old', 'archived');
    INSERT INTO systems VALUES
      ('coded', 'north', 'HV', 'High voltage'),
      ('uncoded', 'north', '', 'Lighting');
    INSERT INTO assets VALUES
      ('done', 'north', 'coded', 'P-100', 'Pump', 'completed'),
      ('blocked', 'south', NULL, 'P-200', 'Valve', 'blocked'),
      ('started', 'north', 'uncoded', 'P-300', 'Lamp', 'in_progress'),
      ('idle', 'old', NULL, 'P-400', 'Fan', 'not_started');
    INSERT INTO test_records VALUES
      ('record', 'north', 'Inspection', NULL),
      ('old-record', 'old', 'Archived inspection', NULL);
    INSERT INTO test_items VALUES
      ('passed', 'record', 'Check torque', 'pass', 1),
      ('failed', 'record', 'Check leaks', 'fail', 2),
      ('pending', 'record', 'Check paint', 'pending', 3),
      ('skipped', 'record', 'Check label', 'not_applicable', 4),
      ('old-failed', 'old-record', 'Check old leaks', 'fail', 1);
    INSERT INTO issues VALUES
      ('critical', 'north', 'Critical leak', 'critical', 'open', NULL),
      ('overdue', 'calm', 'Late paperwork', 'low', 'in_progress', '2026-11-01'),
      ('due-today', 'calm', 'Due today', 'medium', 'open', '2026-11-27'),
      ('blank-due', 'south', 'Blank due', 'high', 'open', ' '),
      ('resolved', 'calm', 'Fixed', 'critical', 'resolved', '2026-01-01'),
      ('archived', 'old', 'Archived critical', 'critical', 'open', NULL);
  `);
  mocks.getDatabase.mockResolvedValue({
    select: (query: string, values: (string | null)[] = []) => {
      const statement = database.prepare(query);
      statement.bind(
        Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value])),
      );
      const rows = [];
      try {
        while (statement.step()) rows.push(statement.getAsObject());
      } finally {
        statement.free();
      }
      return Promise.resolve(rows);
    },
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
  database.close();
  vi.clearAllMocks();
});

describe("workspace metric entries", () => {
  it("matches every Home metric card total", async () => {
    const analytics = await getWorkspaceAnalytics();

    expect(await listWorkspaceMetricEntries("assets", now)).toHaveLength(
      analytics.assets.total,
    );
    expect(await listWorkspaceMetricEntries("test_results", now)).toHaveLength(
      analytics.tests.assessed,
    );
    expect(await listWorkspaceMetricEntries("active_issues", now)).toHaveLength(
      analytics.issues.active,
    );
    expect(
      await listWorkspaceMetricEntries("attention_projects", now),
    ).toHaveLength(analytics.projectsRequiringAttention.total);
  });

  it("lists outstanding assets first with their system label", async () => {
    const entries = await listWorkspaceMetricEntries("assets", now);

    expect(entries.map((entry) => entry.id)).toEqual([
      "blocked", "started", "idle", "done",
    ]);
    expect(entries.find((entry) => entry.id === "done")).toMatchObject({
      projectName: "North", tag: "P-100", system: "HV - High voltage",
    });
    expect(entries.find((entry) => entry.id === "started")?.system).toBe("Lighting");
    expect(entries.find((entry) => entry.id === "blocked")?.system).toBe("");
  });

  it("lists only assessed test items, failures first, with their parent record", async () => {
    const entries = await listWorkspaceMetricEntries("test_results", now);

    expect(entries.map((entry) => [entry.id, entry.result])).toEqual([
      ["failed", "fail"],
      ["old-failed", "fail"],
      ["passed", "pass"],
    ]);
    expect(entries[0]).toMatchObject({
      recordId: "record", recordTitle: "Inspection", description: "Check leaks",
    });
  });

  it("flags overdue active issues using the local calendar date", async () => {
    const entries = await listWorkspaceMetricEntries("active_issues", now);

    expect(entries.map((entry) => entry.id)).toEqual([
      "critical", "archived", "blank-due", "due-today", "overdue",
    ]);
    expect(
      entries.filter((entry) => entry.isOverdue).map((entry) => entry.id),
    ).toEqual(["overdue"]);
    expect(entries.find((entry) => entry.id === "blank-due")?.dueDate).toBeNull();
  });

  it("lists active projects with each attention reason counted", async () => {
    expect(await listWorkspaceMetricEntries("attention_projects", now)).toEqual([
      {
        kind: "attention_projects", id: "north", projectId: "north",
        projectName: "North", criticalIssues: 1, overdueIssues: 0,
        failedTestItems: 1, blockedAssets: 0,
      },
      {
        kind: "attention_projects", id: "calm", projectId: "calm",
        projectName: "Calm", criticalIssues: 0, overdueIssues: 1,
        failedTestItems: 0, blockedAssets: 0,
      },
      {
        kind: "attention_projects", id: "south", projectId: "south",
        projectName: "South", criticalIssues: 0, overdueIssues: 0,
        failedTestItems: 0, blockedAssets: 1,
      },
    ]);
  });
});
