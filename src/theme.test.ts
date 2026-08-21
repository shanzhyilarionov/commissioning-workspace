import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  getStoredTheme,
  initializeTheme,
  resolveTheme,
  saveTheme,
  watchSystemTheme,
} from "./theme";

describe("application theme", () => {
  const storedValues = new Map<string, string>();
  let systemUsesDarkTheme = false;
  let systemThemeListener: ((event: { matches: boolean }) => void) | null = null;
  const documentElement = {
    dataset: {} as Record<string, string>,
    style: { colorScheme: "" },
  };

  beforeEach(() => {
    storedValues.clear();
    systemUsesDarkTheme = false;
    systemThemeListener = null;
    documentElement.dataset = {};
    documentElement.style.colorScheme = "";

    vi.stubGlobal("window", {
      matchMedia: () => ({
        matches: systemUsesDarkTheme,
        addEventListener: (
          _event: string,
          listener: (event: { matches: boolean }) => void,
        ) => {
          systemThemeListener = listener;
        },
        removeEventListener: () => {
          systemThemeListener = null;
        },
      }),
      localStorage: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storedValues.set(key, value);
        },
      },
    });
    vi.stubGlobal("document", { documentElement });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the system preference when no valid preference is stored", () => {
    expect(getStoredTheme()).toBe("system");

    storedValues.set("commissioning-workspace.theme", "unsupported");
    expect(getStoredTheme()).toBe("system");
  });

  it("resolves the system preference to the current operating system theme", () => {
    expect(resolveTheme("system")).toBe("light");

    systemUsesDarkTheme = true;
    expect(resolveTheme("system")).toBe("dark");
  });

  it("applies and saves the selected theme", () => {
    saveTheme("dark");

    expect(storedValues.get("commissioning-workspace.theme")).toBe("dark");
    expect(documentElement.dataset.theme).toBe("dark");
    expect(documentElement.style.colorScheme).toBe("dark");
  });

  it("restores the saved theme during startup", () => {
    storedValues.set("commissioning-workspace.theme", "dark");

    expect(initializeTheme()).toBe("dark");
    expect(documentElement.dataset.theme).toBe("dark");
  });

  it("can apply a theme without changing the stored preference", () => {
    applyTheme("dark");

    expect(getStoredTheme()).toBe("system");
    expect(documentElement.dataset.theme).toBe("dark");
  });

  it("follows live operating system changes only in system mode", () => {
    const stopWatching = watchSystemTheme("system");

    expect(systemThemeListener).not.toBeNull();
    systemThemeListener?.({ matches: true });
    expect(documentElement.dataset.theme).toBe("dark");

    stopWatching();
    expect(systemThemeListener).toBeNull();

    watchSystemTheme("light");
    expect(systemThemeListener).toBeNull();
    expect(documentElement.dataset.theme).toBe("light");
  });
});
