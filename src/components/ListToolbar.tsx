import type { ReactNode } from "react";

interface ListToolbarProps {
  children: ReactNode;
  filterCount: 0 | 1 | 2;
  hasAction?: boolean;
  className?: string;
}

export default function ListToolbar({
  children,
  filterCount,
  hasAction = true,
  className = "",
}: ListToolbarProps) {
  return (
    <div className="list-toolbar-container">
      <div
        className={`list-toolbar ${className}`.trim()}
        data-filter-count={filterCount}
        data-has-action={hasAction}
      >
        {children}
      </div>
    </div>
  );
}
