import { describe, expect, it } from "vitest";
import type { WorkspaceMetricEntry } from "../types/workspaceMetric";
import {
  getWorkspaceMetricFilterOptions,
  matchesWorkspaceMetricFilter,
} from "./workspaceMetricFilters";

const issues: WorkspaceMetricEntry[] = [
  {
    kind: "active_issues", id: "critical", projectId: "b", projectName: "Beta",
    title: "Leak", priority: "critical", status: "open", dueDate: null, isOverdue: false,
  },
  {
    kind: "active_issues", id: "overdue", projectId: "a", projectName: "Alpha",
    title: "Late", priority: "low", status: "in_progress", dueDate: "2026-01-01", isOverdue: true,
  },
];

describe("workspace metric filters", () => {
  it("matches the selected urgency and treats unknown values as no match", () => {
    expect(matchesWorkspaceMetricFilter("active_issues", issues[0], "critical")).toBe(true);
    expect(matchesWorkspaceMetricFilter("active_issues", issues[0], "overdue")).toBe(false);
    expect(matchesWorkspaceMetricFilter("active_issues", issues[1], "all")).toBe(true);
    expect(matchesWorkspaceMetricFilter("active_issues", issues[1], "unknown")).toBe(false);
  });

  it("offers only options and projects that still return rows", () => {
    expect(getWorkspaceMetricFilterOptions("active_issues", issues, "all", "all")).toEqual({
      options: [
        { value: "critical", label: "Critical" },
        { value: "overdue", label: "Overdue" },
      ],
      projects: [["a", "Alpha"], ["b", "Beta"]],
    });
    expect(getWorkspaceMetricFilterOptions("active_issues", issues, "overdue", "b")).toEqual({
      options: [{ value: "critical", label: "Critical" }],
      projects: [["a", "Alpha"]],
    });
  });

  it("filters attention projects by any reason with a positive count", () => {
    const project: WorkspaceMetricEntry = {
      kind: "attention_projects", id: "p", projectId: "p", projectName: "P",
      criticalIssues: 0, overdueIssues: 2, failedTestItems: 0, blockedAssets: 0,
    };

    expect(matchesWorkspaceMetricFilter("attention_projects", project, "overdue")).toBe(true);
    expect(matchesWorkspaceMetricFilter("attention_projects", project, "critical")).toBe(false);
  });
});
