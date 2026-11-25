import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppTheme } from "./theme";

export type WindowMaterial = "opaque" | "translucent";

// The translucent window is only configured in src-tauri/tauri.macos.conf.json.
// Everywhere else there is no native material behind the page to show through.
export function resolveWindowMaterial(): WindowMaterial {
  return isTauri() && navigator.userAgent.includes("Macintosh")
    ? "translucent"
    : "opaque";
}

export function initializeWindowMaterial(): void {
  document.documentElement.dataset.windowMaterial = resolveWindowMaterial();
}

// The native material follows the window appearance, so it has to match the
// theme selected in the app even when that differs from the operating system.
export async function syncWindowTheme(theme: AppTheme): Promise<void> {
  if (resolveWindowMaterial() !== "translucent") {
    return;
  }

  try {
    await getCurrentWindow().setTheme(theme === "system" ? null : theme);
  } catch (error) {
    console.error("Failed to sync the window theme:", error);
  }
}
