import type { ReactNode } from "react";
import { useFixedHeaderTableLayout } from "../styles/layout/useFixedHeaderTableLayout";

interface FixedHeaderTableProps {
  className: string;
  wrapperClassName?: string;
  ariaLabel: string;
  header: ReactNode;
  body: ReactNode;
}

function FixedHeaderTable({
  className,
  wrapperClassName = "",
  ariaLabel,
  header,
  body,
}: FixedHeaderTableProps) {
  const { wrapperRef, scrollRef, tableRef } = useFixedHeaderTableLayout(
    className,
    wrapperClassName,
  );

  const wrapperClasses = [
    "projects-table-wrapper",
    "fixed-header-table",
    wrapperClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const tableClasses = [
    className,
    "fixed-header-table-table",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={wrapperRef} className={wrapperClasses}>
      <div ref={scrollRef} className="fixed-header-table-body">
        <table
          ref={tableRef}
          className={tableClasses}
          aria-label={ariaLabel}
        >
          <thead>{header}</thead>
          <tbody>{body}</tbody>
        </table>
      </div>
    </div>
  );
}

export default FixedHeaderTable;
