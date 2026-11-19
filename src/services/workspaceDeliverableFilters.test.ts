import { describe, expect, it } from "vitest";
import type { WorkspaceDeliverable } from "../types/workspaceDeliverable";
import { getWorkspaceDeliverableFilterOptions } from "./workspaceDeliverableFilters";

function document(
  id: string,
  projectId: string,
  projectName: string,
  status: string,
): WorkspaceDeliverable {
  return {
    kind: "required_documents",
    id,
    projectId,
    projectName,
    title: id,
    status,
    revision: "A",
    context: "",
    parentId: null,
  };
}

const items = [
  document("draft-north", "north", "North", "draft"),
  document("approved-north", "north", "North", "approved"),
  document("draft-south", "south", "South", "draft"),
];

describe("workspace deliverable filter options", () => {
  it("offers only statuses and projects represented in the workstream", () => {
    const options = getWorkspaceDeliverableFilterOptions(items, "all", "all");

    expect([...options.statuses]).toEqual(["draft", "approved"]);
    expect(options.projects).toEqual([["north", "North"], ["south", "South"]]);
  });

  it("hides projects with no records matching the selected status", () => {
    const options = getWorkspaceDeliverableFilterOptions(items, "approved", "all");

    expect(options.projects).toEqual([["north", "North"]]);
    expect([...options.statuses]).toEqual(["draft", "approved"]);
  });

  it("hides statuses with no records in the selected project", () => {
    const options = getWorkspaceDeliverableFilterOptions(items, "all", "south");

    expect([...options.statuses]).toEqual(["draft"]);
    expect(options.projects).toHaveLength(2);
  });

  it("keeps compatible alternatives available when both filters are selected", () => {
    const options = getWorkspaceDeliverableFilterOptions(items, "approved", "north");

    expect([...options.statuses]).toEqual(["draft", "approved"]);
    expect(options.projects).toEqual([["north", "North"]]);
    expect(getWorkspaceDeliverableFilterOptions(items, "draft", "north").projects)
      .toHaveLength(2);
  });

  it("distinguishes projects with the same name and deduplicates repeated records", () => {
    const sameNames = [
      document("one", "project-2", "Expansion", "draft"),
      document("two", "project-1", "Expansion", "draft"),
      document("three", "project-2", "Expansion", "draft"),
    ];

    expect(getWorkspaceDeliverableFilterOptions(sameNames, "all", "all").projects)
      .toEqual([["project-1", "Expansion"], ["project-2", "Expansion"]]);
  });

  it("offers no specific options for an empty workstream", () => {
    const options = getWorkspaceDeliverableFilterOptions([], "all", "all");

    expect(options.statuses.size).toBe(0);
    expect(options.projects).toEqual([]);
  });
});
