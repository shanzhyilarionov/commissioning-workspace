import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeWindowMaterial,
  resolveWindowMaterial,
  syncWindowTheme,
} from "./windowMaterial";

const tauri = vi.hoisted(() => ({
  isTauri: vi.fn<() => boolean>(),
  setTheme: vi.fn<(theme: string | null) => Promise<void>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: tauri.isTauri }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme: tauri.setTheme }),
}));

const MACOS_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const WINDOWS_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";

describe("window material", () => {
  const documentElement = { dataset: {} as Record<string, string> };

  beforeEach(() => {
    documentElement.dataset = {};
    tauri.setTheme.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal("document", { documentElement });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["the macOS app", true, MACOS_USER_AGENT, "translucent"],
    ["the Windows app", true, WINDOWS_USER_AGENT, "opaque"],
    ["a macOS browser", false, MACOS_USER_AGENT, "opaque"],
  ])("resolves the material for %s", (_label, inTauri, userAgent, expected) => {
    tauri.isTauri.mockReturnValue(inTauri);
    vi.stubGlobal("navigator", { userAgent });

    expect(resolveWindowMaterial()).toBe(expected);
  });

  it("exposes the material to the stylesheets", () => {
    tauri.isTauri.mockReturnValue(true);
    vi.stubGlobal("navigator", { userAgent: MACOS_USER_AGENT });

    initializeWindowMaterial();

    expect(documentElement.dataset.windowMaterial).toBe("translucent");
  });

  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["system", null],
  ] as const)("syncs the %s theme to the native window", async (theme, expected) => {
    tauri.isTauri.mockReturnValue(true);
    vi.stubGlobal("navigator", { userAgent: MACOS_USER_AGENT });

    await syncWindowTheme(theme);

    expect(tauri.setTheme).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it("leaves opaque windows alone", async () => {
    tauri.isTauri.mockReturnValue(true);
    vi.stubGlobal("navigator", { userAgent: WINDOWS_USER_AGENT });

    await syncWindowTheme("dark");

    expect(tauri.setTheme).not.toHaveBeenCalled();
  });
});
