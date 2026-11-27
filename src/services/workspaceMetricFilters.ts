import type {
  WorkspaceMetricEntry,
  WorkspaceMetricEntryOf,
  WorkspaceMetricKind,
} from "../types/workspaceMetric";

export interface WorkspaceMetricFilterOption<Kind extends WorkspaceMetricKind> {
  value: string;
  label: string;
  matches: (entry: WorkspaceMetricEntryOf<Kind>) => boolean;
}

export interface WorkspaceMetricFilterDefinition<
  Kind extends WorkspaceMetricKind,
> {
  ariaLabel: string;
  allLabel: string;
  options: readonly WorkspaceMetricFilterOption<Kind>[];
}

export const workspaceMetricFilters: {
  [Kind in WorkspaceMetricKind]: WorkspaceMetricFilterDefinition<Kind>;
} = {
  assets: {
    ariaLabel: "Filter by status",
    allLabel: "All statuses",
    options: [
      { value: "blocked", label: "Blocked", matches: (entry) => entry.status === "blocked" },
      { value: "in_progress", label: "In progress", matches: (entry) => entry.status === "in_progress" },
      { value: "not_started", label: "Not started", matches: (entry) => entry.status === "not_started" },
      { value: "completed", label: "Completed", matches: (entry) => entry.status === "completed" },
    ],
  },
  test_results: {
    ariaLabel: "Filter by result",
    allLabel: "All results",
    options: [
      { value: "fail", label: "Failed", matches: (entry) => entry.result === "fail" },
      { value: "pass", label: "Passed", matches: (entry) => entry.result === "pass" },
    ],
  },
  active_issues: {
    ariaLabel: "Filter by urgency",
    allLabel: "All active issues",
    options: [
      { value: "critical", label: "Critical", matches: (entry) => entry.priority === "critical" },
      { value: "overdue", label: "Overdue", matches: (entry) => entry.isOverdue },
    ],
  },
  attention_projects: {
    ariaLabel: "Filter by reason",
    allLabel: "All reasons",
    options: [
      { value: "critical", label: "Critical issues", matches: (entry) => entry.criticalIssues > 0 },
      { value: "overdue", label: "Overdue issues", matches: (entry) => entry.overdueIssues > 0 },
      { value: "failed", label: "Failed test items", matches: (entry) => entry.failedTestItems > 0 },
      { value: "blocked", label: "Blocked assets", matches: (entry) => entry.blockedAssets > 0 },
    ],
  },
};

function getFilterOptions(
  kind: WorkspaceMetricKind,
): readonly WorkspaceMetricFilterOption<WorkspaceMetricKind>[] {
  return workspaceMetricFilters[kind].options as readonly WorkspaceMetricFilterOption<WorkspaceMetricKind>[];
}

function matchesOption(
  option: WorkspaceMetricFilterOption<WorkspaceMetricKind>,
  kind: WorkspaceMetricKind,
  entry: WorkspaceMetricEntry,
): boolean {
  return entry.kind === kind && option.matches(entry as never);
}

export function matchesWorkspaceMetricFilter(
  kind: WorkspaceMetricKind,
  entry: WorkspaceMetricEntry,
  filter: string,
): boolean {
  if (filter === "all") {
    return true;
  }

  const option = getFilterOptions(kind).find(
    (candidate) => candidate.value === filter,
  );

  return option ? matchesOption(option, kind, entry) : false;
}

/* Each filter lists only the choices that still return rows under the other
   filter, so picking an option never leads to an unexplained empty table. */
export function getWorkspaceMetricFilterOptions(
  kind: WorkspaceMetricKind,
  entries: readonly WorkspaceMetricEntry[],
  filter: string,
  projectFilter: string,
) {
  const projectScoped = entries.filter(
    (entry) => projectFilter === "all" || entry.projectId === projectFilter,
  );
  const options = getFilterOptions(kind).filter((option) =>
    projectScoped.some((entry) => matchesOption(option, kind, entry)),
  );
  const projects = new Map<string, string>();

  for (const entry of entries) {
    if (matchesWorkspaceMetricFilter(kind, entry, filter)) {
      projects.set(entry.projectId, entry.projectName);
    }
  }

  return {
    options: options.map(({ value, label }) => ({ value, label })),
    projects: Array.from(projects).sort(
      ([firstId, firstName], [secondId, secondName]) =>
        firstName.localeCompare(secondName, undefined, { numeric: true }) ||
        firstId.localeCompare(secondId),
    ),
  };
}
