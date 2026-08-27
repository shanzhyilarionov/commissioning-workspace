import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearContinueWorkingLocation,
  loadContinueWorkingLocation,
  saveContinueWorkingLocation,
} from "./continueWorkingService";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("continueWorkingService", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: new MemoryStorage(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves and restores a valid project location", () => {
    const location = {
      projectId: "project-1",
      page: "Checklists & Tests" as const,
      visitedAt: "2026-08-27T12:00:00.000Z",
    };

    saveContinueWorkingLocation(location);

    expect(loadContinueWorkingLocation()).toEqual(location);
  });

  it("clears the saved project location", () => {
    saveContinueWorkingLocation({
      projectId: "project-1",
      page: "Overview",
      visitedAt: "2026-08-27T12:00:00.000Z",
    });

    clearContinueWorkingLocation();

    expect(loadContinueWorkingLocation()).toBeNull();
  });
});
