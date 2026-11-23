import type { AuditEntityType } from "./audit";
import type { ProjectAttentionItem } from "./projectOverview";

export type AttentionDestinationPage =
  | "Systems"
  | "Assets"
  | "Checklists & Tests"
  | "Issues"
  | "Documents"
  | "Turnover packages";

export interface AssetStructureNavigation {
  systemId: string | null;
  returnSystemId: string | null;
}

export interface AuditNavigationItem {
  navigationKind: "audit";
  entityType: AuditEntityType;
  id: string;
  matchText: string;
  parentId: string | null;
}

export type ProjectNavigationItem =
  | ProjectAttentionItem
  | AuditNavigationItem;

export function isAuditNavigationItem(
  item: ProjectNavigationItem,
): item is AuditNavigationItem {
  return "navigationKind" in item && item.navigationKind === "audit";
}

export function getAuditDestinationPage(
  entityType: AuditEntityType,
): AttentionDestinationPage | null {
  switch (entityType) {
    case "system":
    case "subsystem":
      return "Systems";
    case "asset":
      return "Assets";
    case "test_record":
    case "test_item":
      return "Checklists & Tests";
    case "issue":
      return "Issues";
    case "document":
      return "Documents";
    case "turnover_package":
      return "Turnover packages";
    case "project":
      return null;
  }
}
