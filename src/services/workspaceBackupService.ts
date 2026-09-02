import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { closeDatabase, getDatabase } from "./database";
import type {
  AutomaticBackupPreferences,
  AutomaticBackupStatus,
  WorkspaceBackupInspection,
  WorkspaceBackupSummary,
  WorkspaceRestoreSummary,
} from "../types/workspaceBackup";

const AUTOMATIC_BACKUP_PREFERENCES_KEY =
  "commissioning-workspace.automatic-backups";

export const AUTOMATIC_BACKUP_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export interface AutomaticBackupMonitorSnapshot {
  status: AutomaticBackupStatus | null;
  error: string | null;
  checkedAt: string | null;
}

type AutomaticBackupMonitorListener = (
  snapshot: AutomaticBackupMonitorSnapshot,
) => void;

let automaticBackupMonitorSnapshot: AutomaticBackupMonitorSnapshot = {
  status: null,
  error: null,
  checkedAt: null,
};
let automaticBackupCheckQueue: Promise<void> = Promise.resolve();
const automaticBackupMonitorListeners =
  new Set<AutomaticBackupMonitorListener>();

function publishAutomaticBackupMonitorSnapshot(
  snapshot: AutomaticBackupMonitorSnapshot,
): void {
  automaticBackupMonitorSnapshot = snapshot;
  automaticBackupMonitorListeners.forEach((listener) => listener(snapshot));
}

export function subscribeAutomaticBackupMonitor(
  listener: AutomaticBackupMonitorListener,
): () => void {
  automaticBackupMonitorListeners.add(listener);
  listener(automaticBackupMonitorSnapshot);
  return () => automaticBackupMonitorListeners.delete(listener);
}

function automaticBackupErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error || "Automatic backup failed.");
}

export const DEFAULT_AUTOMATIC_BACKUP_PREFERENCES: AutomaticBackupPreferences = {
  enabled: true,
  frequency: "daily",
  retentionCount: 10,
  backupRoot: null,
};

export function getAutomaticBackupPreferences(): AutomaticBackupPreferences {
  try {
    const stored = window.localStorage.getItem(
      AUTOMATIC_BACKUP_PREFERENCES_KEY,
    );
    if (!stored) {
      return DEFAULT_AUTOMATIC_BACKUP_PREFERENCES;
    }

    const value = JSON.parse(stored) as Partial<AutomaticBackupPreferences>;
    const frequency = value.frequency === "weekly" ? "weekly" : "daily";
    const retentionCount = [5, 10, 20].includes(value.retentionCount ?? 0)
      ? value.retentionCount!
      : DEFAULT_AUTOMATIC_BACKUP_PREFERENCES.retentionCount;
    const backupRoot =
      typeof value.backupRoot === "string" && value.backupRoot.trim()
        ? value.backupRoot
        : null;

    return {
      enabled: value.enabled !== false,
      frequency,
      retentionCount,
      backupRoot,
    };
  } catch {
    return DEFAULT_AUTOMATIC_BACKUP_PREFERENCES;
  }
}

export function saveAutomaticBackupPreferences(
  preferences: AutomaticBackupPreferences,
): void {
  window.localStorage.setItem(
    AUTOMATIC_BACKUP_PREFERENCES_KEY,
    JSON.stringify(preferences),
  );
}

export async function runAutomaticWorkspaceBackup(
  preferences: AutomaticBackupPreferences,
): Promise<AutomaticBackupStatus> {
  if (!preferences.enabled) {
    return getAutomaticWorkspaceBackupStatus(preferences);
  }

  return invoke<AutomaticBackupStatus>("run_automatic_workspace_backup", {
    frequencyDays: preferences.frequency === "weekly" ? 7 : 1,
    retentionCount: preferences.retentionCount,
    backupRoot: preferences.backupRoot,
  });
}

export async function getAutomaticWorkspaceBackupStatus(
  preferences: AutomaticBackupPreferences = getAutomaticBackupPreferences(),
): Promise<AutomaticBackupStatus> {
  return invoke<AutomaticBackupStatus>("get_automatic_workspace_backup_status", {
    frequencyDays: preferences.frequency === "weekly" ? 7 : 1,
    backupRoot: preferences.backupRoot,
  });
}

export function checkAutomaticWorkspaceBackup(
  preferences: AutomaticBackupPreferences = getAutomaticBackupPreferences(),
): Promise<AutomaticBackupStatus> {
  const runCheck = async (): Promise<AutomaticBackupStatus> => {
    try {
      const status = await runAutomaticWorkspaceBackup(preferences);
      publishAutomaticBackupMonitorSnapshot({
        status,
        error: null,
        checkedAt: new Date().toISOString(),
      });
      return status;
    } catch (error) {
      publishAutomaticBackupMonitorSnapshot({
        status: automaticBackupMonitorSnapshot.status,
        error: automaticBackupErrorMessage(error),
        checkedAt: new Date().toISOString(),
      });
      throw error;
    }
  };

  const result = automaticBackupCheckQueue.then(runCheck, runCheck);
  automaticBackupCheckQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function chooseAutomaticBackupDirectory(): Promise<string | null> {
  const selectedPath = await open({
    title: "Choose automatic backup location",
    multiple: false,
    directory: true,
  });

  return typeof selectedPath === "string" ? selectedPath : null;
}

function defaultBackupFileName(): string {
  const timestamp = new Date()
    .toISOString()
    .replace("T", " ")
    .replace(/:/g, "-")
    .slice(0, 19);
  return `Commissioning Workspace - ${timestamp}.cwb`;
}

export async function chooseAndCreateWorkspaceBackup(): Promise<
  WorkspaceBackupSummary | null
> {
  const selectedPath = await save({
    title: "Create workspace backup",
    defaultPath: defaultBackupFileName(),
    filters: [
      {
        name: "Commissioning Workspace backup",
        extensions: ["cwb"],
      },
    ],
  });

  if (!selectedPath) {
    return null;
  }

  const outputPath = selectedPath.toLowerCase().endsWith(".cwb")
    ? selectedPath
    : `${selectedPath}.cwb`;
  return invoke<WorkspaceBackupSummary>("create_workspace_backup", {
    outputPath,
  });
}

export async function chooseAndInspectWorkspaceBackup(): Promise<
  WorkspaceBackupInspection | null
> {
  const selectedPath = await open({
    title: "Select workspace backup",
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Commissioning Workspace backup",
        extensions: ["cwb"],
      },
    ],
  });

  if (!selectedPath) {
    return null;
  }

  return invoke<WorkspaceBackupInspection>("inspect_workspace_backup", {
    path: selectedPath,
  });
}

export async function restoreWorkspaceBackup(
  inspection: WorkspaceBackupInspection,
): Promise<WorkspaceRestoreSummary> {
  await closeDatabase();

  try {
    return await invoke<WorkspaceRestoreSummary>(
      "restore_workspace_backup",
      {
        path: inspection.path,
        backupRoot: getAutomaticBackupPreferences().backupRoot,
      },
    );
  } catch (error) {
    await getDatabase().catch(() => undefined);
    throw error;
  }
}

export async function clearWorkspace(): Promise<void> {
  await closeDatabase();

  try {
    await invoke("clear_workspace", {
      backupRoot: getAutomaticBackupPreferences().backupRoot,
    });
  } catch (error) {
    await getDatabase().catch(() => undefined);
    throw error;
  }
}

export async function revealBackup(path: string): Promise<void> {
  await revealItemInDir(path);
}

export async function openWorkspaceBackupDirectory(): Promise<void> {
  await invoke("open_workspace_backup_directory", {
    backupRoot: getAutomaticBackupPreferences().backupRoot,
  });
}
