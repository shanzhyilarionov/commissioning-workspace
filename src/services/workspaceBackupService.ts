import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { closeDatabase, getDatabase } from "./database";
import type {
  WorkspaceBackupInspection,
  WorkspaceBackupSummary,
  WorkspaceRestoreSummary,
} from "../types/workspaceBackup";

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
      { path: inspection.path },
    );
  } catch (error) {
    await getDatabase().catch(() => undefined);
    throw error;
  }
}

export async function restartApplication(): Promise<void> {
  try {
    await invoke("restart_application");
  } catch (error) {
    await getDatabase().catch(() => undefined);
    throw error;
  }
}

export async function revealBackup(path: string): Promise<void> {
  await revealItemInDir(path);
}

export async function openWorkspaceBackupDirectory(): Promise<void> {
  await invoke("open_workspace_backup_directory");
}
