import type { WorkspaceDeliverable } from "../types/workspaceDeliverable";

export function getWorkspaceDeliverableFilterOptions(
  items: readonly WorkspaceDeliverable[],
  statusFilter: string,
  projectFilter: string,
) {
  const statuses = new Set<string>();
  const projects = new Map<string, string>();

  for (const item of items) {
    if (projectFilter === "all" || item.projectId === projectFilter) {
      statuses.add(item.status);
    }

    if (statusFilter === "all" || item.status === statusFilter) {
      projects.set(item.projectId, item.projectName);
    }
  }

  return {
    statuses,
    projects: Array.from(projects).sort(
      ([firstId, firstName], [secondId, secondName]) =>
        firstName.localeCompare(secondName, undefined, { numeric: true }) ||
        firstId.localeCompare(secondId),
    ),
  };
}
