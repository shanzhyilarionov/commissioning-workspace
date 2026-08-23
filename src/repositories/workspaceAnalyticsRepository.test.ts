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
  select: vi.fn(),
}));

vi.mock("../services/database", () => ({
  getDatabase: mocks.getDatabase,
}));

import { getWorkspaceAnalytics } from "./workspaceAnalyticsRepository";

describe("getWorkspaceAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T16:00:00.000Z"));
    mocks.getDatabase.mockResolvedValue({ select: mocks.select });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps summary data and groups recent audit activity", async () => {
    mocks.select
      .mockResolvedValueOnce([
        {
          asset_total: 12,
          asset_not_started: 2,
          asset_in_progress: 3,
          asset_completed: 6,
          asset_blocked: 1,
          test_item_total: 10,
          test_item_pending: 2,
          test_item_passed: 6,
          test_item_failed: 2,
          test_item_not_applicable: 0,
          issue_active: 4,
          issue_critical: 1,
          issue_overdue: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          action: "created",
          details_json: "{}",
          created_at: "2026-08-22T15:00:00.000Z",
        },
        {
          action: "updated",
          details_json: "{}",
          created_at: "2026-08-21T15:00:00.000Z",
        },
        {
          action: "status_changed",
          details_json: JSON.stringify({
            after: { status: "completed" },
          }),
          created_at: "2026-08-20T15:00:00.000Z",
        },
        {
          action: "result_changed",
          details_json: JSON.stringify({
            after: { result: "pass" },
          }),
          created_at: "2026-08-19T15:00:00.000Z",
        },
      ]);

    const analytics = await getWorkspaceAnalytics();

    expect(analytics.assets).toEqual({
      total: 12,
      notStarted: 2,
      inProgress: 3,
      completed: 6,
      blocked: 1,
    });
    expect(analytics.tests.passRate).toBe(75);
    expect(analytics.issues).toEqual({
      active: 4,
      critical: 1,
      overdue: 2,
    });
    expect(analytics.recentActivity).toEqual({
      created: 1,
      updated: 1,
      closedOut: 2,
    });
    expect(
      analytics.weeklyActivity[analytics.weeklyActivity.length - 1],
    ).toMatchObject({
      created: 1,
      closedOut: 2,
    });
  });
});
