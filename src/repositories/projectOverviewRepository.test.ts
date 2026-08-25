import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  listStructureReadinessSummaries: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../services/database", () => ({
  getDatabase: mocks.getDatabase,
}));

vi.mock("./readinessRepository", () => ({
  listStructureReadinessSummaries:
    mocks.listStructureReadinessSummaries,
}));

import { getProjectOverview } from "./projectOverviewRepository";

describe("getProjectOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T16:00:00.000Z"));
    mocks.getDatabase.mockResolvedValue({ select: mocks.select });
    mocks.listStructureReadinessSummaries.mockResolvedValue([
      {
        kind: "system",
        structureId: "system-1",
        code: "SYS-01",
        name: "Cooling water",
        stage: "in_progress",
        blockerCount: 3,
        updatedAt: "2026-08-24T12:00:00.000Z",
      },
      {
        kind: "subsystem",
        structureId: "subsystem-1",
        code: "SUB-01",
        name: "Pump train",
        stage: "ready",
        blockerCount: 1,
        updatedAt: "2026-08-24T12:00:00.000Z",
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps project scope, closeout, deadlines, coverage, and activity", async () => {
    mocks.select
      .mockResolvedValueOnce([
        {
          asset_total: 10,
          asset_not_started: 1,
          asset_in_progress: 2,
          asset_completed: 6,
          asset_blocked: 1,
          test_record_total: 8,
          test_record_not_started: 1,
          test_record_in_progress: 2,
          test_record_completed: 4,
          test_record_blocked: 1,
          test_item_total: 24,
          test_item_pending: 4,
          test_item_passed: 17,
          test_item_failed: 2,
          test_item_not_applicable: 1,
          issue_total: 7,
          issue_active: 3,
          issue_open: 2,
          issue_in_progress: 1,
          issue_critical: 1,
          issue_high: 1,
          issue_overdue: 1,
          issue_resolved: 2,
          issue_closed: 2,
          system_total: 3,
          system_not_started: 0,
          system_in_progress: 1,
          system_ready: 1,
          system_commissioned: 0,
          system_handed_over: 1,
          subsystem_total: 5,
          subsystem_not_started: 1,
          subsystem_in_progress: 1,
          subsystem_ready: 1,
          subsystem_commissioned: 1,
          subsystem_handed_over: 1,
          required_document_total: 6,
          required_document_approved: 4,
          test_record_signed: 3,
          turnover_package_total: 2,
          turnover_package_final: 1,
          issue_due_soon: 2,
          issue_no_due_date: 1,
          issue_unassigned: 1,
          assets_without_test_records: 2,
          test_records_without_items: 1,
          systems_without_assets: 0,
          subsystems_without_assets: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "record-1",
          attention_type: "unsigned_test_record",
          title: "Pump functional test",
          detail: "P-101 · All test items assessed",
          status: "unsigned",
          updated_at: "2026-08-24T12:00:00.000Z",
          sort_priority: 4,
          match_text: "Pump functional test",
          parent_id: null,
          parent_title: null,
        },
      ])
      .mockResolvedValueOnce([
        { action: "created", details_json: "{}" },
        { action: "signed", details_json: "{}" },
        {
          action: "result_changed",
          details_json: JSON.stringify({
            after: { result: "not_applicable" },
          }),
        },
      ]);

    const overview = await getProjectOverview("project-1");

    expect(overview.scope.systems).toEqual({
      total: 3,
      notStarted: 0,
      inProgress: 1,
      ready: 1,
      commissioned: 0,
      handedOver: 1,
      blocked: 1,
    });
    expect(overview.scope.subsystems.blocked).toBe(1);
    expect(overview.deliverables).toEqual({
      requiredDocumentsTotal: 6,
      requiredDocumentsApproved: 4,
      testRecordsTotal: 8,
      testRecordsSigned: 3,
      subsystemsTotal: 5,
      subsystemsHandedOver: 1,
      turnoverPackagesTotal: 2,
      turnoverPackagesFinal: 1,
    });
    expect(overview.deadlines).toEqual({
      dueSoon: 2,
      overdue: 1,
      noDueDate: 1,
      unassigned: 1,
    });
    expect(overview.coverage).toEqual({
      assetsWithoutTestRecords: 2,
      testRecordsWithoutItems: 1,
      systemsWithoutAssets: 0,
      subsystemsWithoutAssets: 1,
    });
    expect(overview.recentActivity).toEqual({
      created: 1,
      closedOut: 2,
      netChange: -1,
    });
    expect(overview.attentionItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "unsigned_test_record" }),
        expect.objectContaining({ type: "system_readiness" }),
      ]),
    );
  });
});
