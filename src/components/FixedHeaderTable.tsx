import {
  useRef,
  type ReactNode,
  type UIEvent,
} from "react";

interface FixedHeaderTableProps {
  className: string;
  wrapperClassName?: string;
  ariaLabel: string;
  colGroup?: ReactNode;
  header: ReactNode;
  body: ReactNode;
}

function FixedHeaderTable({
  className,
  wrapperClassName = "",
  ariaLabel,
  colGroup,
  header,
  body,
}: FixedHeaderTableProps) {
  const headerScrollRef =
    useRef<HTMLDivElement | null>(null);

  function handleBodyScroll(
    event: UIEvent<HTMLDivElement>,
  ) {
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft =
        event.currentTarget.scrollLeft;
    }
  }

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
    <div className={wrapperClasses}>
      <div
        ref={headerScrollRef}
        className="fixed-header-table-header"
      >
        <table
          className={tableClasses}
          aria-hidden="true"
        >
          {colGroup}
          <thead>{header}</thead>
        </table>
      </div>

      <div
        className="fixed-header-table-body"
        onScroll={handleBodyScroll}
      >
        <table
          className={tableClasses}
          aria-label={ariaLabel}
        >
          {colGroup}
          <tbody>{body}</tbody>
        </table>
      </div>
    </div>
  );
}

export default FixedHeaderTable;
