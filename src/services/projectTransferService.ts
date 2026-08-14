import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { closeDatabase, getDatabase } from "./database";
import type {
  ProjectPackageImportSummary,
  ProjectPackageInspection,
  ProjectPackageSummary,
} from "../types/projectTransfer";

function defaultProjectPackageFileName(projectCount: number): string {
  const timestamp = new Date()
    .toISOString()
    .replace("T", " ")
    .replace(/:/g, "-")
    .slice(0, 19);
  const label = projectCount === 1 ? "Project" : `${projectCount} Projects`;
  return `Commissioning Workspace - ${label} - ${timestamp}.cwp`;
}

export async function chooseAndCreateProjectPackage(
  projectIds: string[],
): Promise<ProjectPackageSummary | null> {
  const selectedPath = await save({
    title: "Export projects",
    defaultPath: defaultProjectPackageFileName(projectIds.length),
    filters: [
      {
        name: "Commissioning Workspace project package",
        extensions: ["cwp"],
      },
    ],
  });

  if (!selectedPath) {
    return null;
  }

  const outputPath = selectedPath.toLowerCase().endsWith(".cwp")
    ? selectedPath
    : `${selectedPath}.cwp`;
  await closeDatabase();

  try {
    const result = await invoke<ProjectPackageSummary>("create_project_package", {
      outputPath,
      projectIds,
    });
    await getDatabase();
    return result;
  } catch (error) {
    await getDatabase().catch(() => undefined);
    throw error;
  }
}

export async function chooseAndInspectProjectPackage(): Promise<
  ProjectPackageInspection | null
> {
  const selectedPath = await open({
    title: "Import projects",
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Commissioning Workspace project package",
        extensions: ["cwp"],
      },
    ],
  });

  if (!selectedPath) {
    return null;
  }

  return invoke<ProjectPackageInspection>("inspect_project_package", {
    path: selectedPath,
  });
}

export async function importProjectPackage(
  inspection: ProjectPackageInspection,
): Promise<ProjectPackageImportSummary> {
  await closeDatabase();

  try {
    const result = await invoke<ProjectPackageImportSummary>(
      "import_project_package",
      {
        path: inspection.path,
      },
    );
    await getDatabase();
    return result;
  } catch (error) {
    await getDatabase().catch(() => undefined);
    throw error;
  }
}

export async function revealProjectPackage(path: string): Promise<void> {
  await revealItemInDir(path);
}
