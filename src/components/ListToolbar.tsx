import type { ReactNode } from "react";

interface ListToolbarProps {
  children: ReactNode;
  filterCount: 1 | 2;
  hasAction?: boolean;
}

export default function ListToolbar({
  children,
  filterCount,
  hasAction = true,
}: ListToolbarProps) {
  return (
    <div className="list-toolbar-container">
      <div
        className="list-toolbar"
        data-filter-count={filterCount}
        data-has-action={hasAction}
      >
        {children}
      </div>
    </div>
  );
}
