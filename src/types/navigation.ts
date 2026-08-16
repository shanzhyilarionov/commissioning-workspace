import type { AuditEntityType } from "./audit";
import type { ProjectAttentionItem } from "./projectOverview";

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
