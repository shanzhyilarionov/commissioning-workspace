import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  closeDatabase: vi.fn(),
  getDatabase: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

vi.mock("../services/database", () => ({
  closeDatabase: mocks.closeDatabase,
  getDatabase: mocks.getDatabase,
}));

import { deleteProject } from "./projectRepository";

describe("deleteProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.closeDatabase.mockResolvedValue(undefined);
    mocks.getDatabase.mockResolvedValue({});
    mocks.invoke.mockResolvedValue(undefined);
  });

  it("closes the pooled database and delegates deletion to one Rust command", async () => {
    await deleteProject("project-1");

    expect(mocks.closeDatabase).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledWith("delete_project", {
      projectId: "project-1",
    });
    expect(mocks.getDatabase).toHaveBeenCalledOnce();
    expect(mocks.closeDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.invoke.mock.invocationCallOrder[0],
    );
    expect(mocks.invoke.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getDatabase.mock.invocationCallOrder[0],
    );
  });

  it("reopens the database and preserves the deletion error", async () => {
    mocks.invoke.mockRejectedValue("database is locked");

    await expect(deleteProject("project-1")).rejects.toBe("database is locked");
    expect(mocks.getDatabase).toHaveBeenCalledOnce();
  });
});
