import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

interface FixedHeaderTableProps {
  className: string;
  wrapperClassName?: string;
  ariaLabel: string;
  colGroup?: ReactNode;
  header: ReactNode;
  body: ReactNode;
}

function readPixelValue(
  styles: CSSStyleDeclaration,
  propertyName: string,
  fallback: number,
): number {
  const value = Number.parseFloat(styles.getPropertyValue(propertyName));

  return Number.isFinite(value) ? value : fallback;
}

function FixedHeaderTable({
  className,
  wrapperClassName = "",
  ariaLabel,
  colGroup,
  header,
  body,
}: FixedHeaderTableProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  useLayoutEffect(() => {
    const wrapperElement = wrapperRef.current;
    const scrollElement = scrollRef.current;
    const tableElement = tableRef.current;

    if (!wrapperElement || !scrollElement || !tableElement) {
      return;
    }

    let animationFrameId: number | null = null;

    const updateLayout = () => {
      animationFrameId = null;

      scrollElement.classList.remove("has-vertical-overflow");

      const horizontalScrollbarHeight = Math.max(
        0,
        scrollElement.offsetHeight - scrollElement.clientHeight,
      );

      const availableContentHeight =
        scrollElement.clientHeight + horizontalScrollbarHeight;

      const hasVerticalOverflow =
        scrollElement.scrollHeight > availableContentHeight + 1;

      scrollElement.classList.toggle(
        "has-vertical-overflow",
        hasVerticalOverflow,
      );

      const tableStyles = window.getComputedStyle(tableElement);
      const rootStyles = window.getComputedStyle(
        document.documentElement,
      );

      const minimumTableWidth = readPixelValue(
        tableStyles,
        "--table-min-width-value",
        0,
      );

      const fixedSideCount = Math.max(
        1,
        readPixelValue(
          tableStyles,
          "--table-fixed-side-count",
          2,
        ),
      );

      const minimumPadding = readPixelValue(
        rootStyles,
        "--table-fixed-padding-x-min",
        4,
      );

      const maximumPadding = readPixelValue(
        rootStyles,
        "--table-fixed-padding-x-max",
        22,
      );

      const availableWidth = Math.max(
        0,
        scrollElement.clientWidth - minimumTableWidth,
      );

      const nextPadding = Math.min(
        maximumPadding,
        minimumPadding +
          availableWidth / (fixedSideCount * 2),
      );

      const nextPaddingValue = `${nextPadding.toFixed(2)}px`;

      if (
        wrapperElement.style.getPropertyValue(
          "--table-fixed-padding-x",
        ) !== nextPaddingValue
      ) {
        wrapperElement.style.setProperty(
          "--table-fixed-padding-x",
          nextPaddingValue,
        );
      }
    };

    const scheduleLayoutUpdate = () => {
      if (animationFrameId !== null) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(updateLayout);
    };

    scheduleLayoutUpdate();
    scrollElement.scrollLeft = 0;

    const resizeObserver = new ResizeObserver(scheduleLayoutUpdate);
    resizeObserver.observe(wrapperElement);
    resizeObserver.observe(scrollElement);
    resizeObserver.observe(tableElement);

    const mutationObserver = new MutationObserver(scheduleLayoutUpdate);
    mutationObserver.observe(tableElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [className, wrapperClassName]);

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
          {colGroup}
          <thead>{header}</thead>
          <tbody>{body}</tbody>
        </table>
      </div>
    </div>
  );
}

export default FixedHeaderTable;
