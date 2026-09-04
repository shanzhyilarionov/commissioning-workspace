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
  getReportingIdentity,
  saveReportingIdentity,
} from "./workspaceSettingsRepository";

describe("workspace reporting identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({ rowsAffected: 3 });
    mocks.getDatabase.mockResolvedValue({
      execute: mocks.execute,
      select: mocks.select,
    });
  });

  it("loads every reporting identity field", async () => {
    mocks.select.mockResolvedValue([
      { key: "reporting_job_title", value: "Commissioning Engineer" },
      { key: "current_operator", value: "Morgan Lee" },
      { key: "reporting_organization", value: "Northline Energy" },
    ]);

    await expect(getReportingIdentity()).resolves.toEqual({
      operatorName: "Morgan Lee",
      organization: "Northline Energy",
      jobTitle: "Commissioning Engineer",
    });
  });

  it("returns empty values for settings that have not been saved", async () => {
    mocks.select.mockResolvedValue([
      { key: "current_operator", value: "Morgan Lee" },
    ]);

    await expect(getReportingIdentity()).resolves.toEqual({
      operatorName: "Morgan Lee",
      organization: "",
      jobTitle: "",
    });
  });

  it("trims and saves all fields in one database operation", async () => {
    await expect(
      saveReportingIdentity({
        operatorName: "  Morgan Lee  ",
        organization: "  Northline Energy  ",
        jobTitle: "  Commissioning Engineer  ",
      }),
    ).resolves.toEqual({
      operatorName: "Morgan Lee",
      organization: "Northline Energy",
      jobTitle: "Commissioning Engineer",
    });

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute.mock.calls[0]?.[0]).toContain(
      "reporting_organization",
    );
    expect(mocks.execute.mock.calls[0]?.[1]?.slice(0, 3)).toEqual([
      "Morgan Lee",
      "Northline Energy",
      "Commissioning Engineer",
    ]);
  });
});
