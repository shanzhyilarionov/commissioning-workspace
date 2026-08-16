import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getDatabase: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../services/database", () => ({
  getDatabase: mocks.getDatabase,
}));

import {
  listAuditEvents,
  setCurrentOperator,
} from "./auditRepository";

describe("setCurrentOperator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({ rowsAffected: 1 });
    mocks.select.mockResolvedValue([]);
    mocks.getDatabase.mockResolvedValue({
      execute: mocks.execute,
      select: mocks.select,
    });
  });

  it("trims and saves the current operator", async () => {
    await expect(setCurrentOperator("  Morgan Lee  ")).resolves.toBe(
      "Morgan Lee",
    );

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute.mock.calls[0]?.[0]).toContain(
      "INSERT INTO workspace_settings",
    );
    expect(mocks.execute.mock.calls[0]?.[1]?.[0]).toBe("Morgan Lee");
  });

  it("removes the current operator when the input is empty", async () => {
    await expect(setCurrentOperator("   ")).resolves.toBe("");

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute.mock.calls[0]?.[0]).toContain(
      "DELETE FROM workspace_settings",
    );
  });
});

describe("listAuditEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDatabase.mockResolvedValue({ select: mocks.select });
  });

  it("returns parent records used for precise audit navigation", async () => {
    mocks.select.mockResolvedValue([
      {
        id: "event-1",
        project_id: "project-1",
        entity_type: "test_item",
        entity_id: "item-1",
        parent_entity_id: "record-1",
        action: "result_changed",
        entity_label: "Verify pump rotation",
        actor: "Morgan Lee",
        reason: "Corrected after retest",
        details_json: "{}",
        created_at: "2026-08-15T20:00:00.000Z",
      },
    ]);

    await expect(listAuditEvents("project-1", 12)).resolves.toEqual([
      {
        id: "event-1",
        projectId: "project-1",
        entityType: "test_item",
        entityId: "item-1",
        parentEntityId: "record-1",
        action: "result_changed",
        entityLabel: "Verify pump rotation",
        actor: "Morgan Lee",
        reason: "Corrected after retest",
        detailsJson: "{}",
        createdAt: "2026-08-15T20:00:00.000Z",
      },
    ]);

    expect(mocks.select.mock.calls[0]?.[0]).toContain(
      "END AS parent_entity_id",
    );
    expect(mocks.select.mock.calls[0]?.[1]).toEqual(["project-1", 12]);
  });
});
