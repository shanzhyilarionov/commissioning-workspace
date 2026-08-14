import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getDatabase: vi.fn(),
}));

vi.mock("../services/database", () => ({
  getDatabase: mocks.getDatabase,
}));

import { setCurrentOperator } from "./auditRepository";

describe("setCurrentOperator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({ rowsAffected: 1 });
    mocks.getDatabase.mockResolvedValue({ execute: mocks.execute });
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
