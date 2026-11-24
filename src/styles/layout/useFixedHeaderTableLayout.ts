import { useLayoutEffect, useRef } from "react";

function readPixelValue(
  styles: CSSStyleDeclaration,
  propertyName: string,
  fallback: number,
): number {
  const value = Number.parseFloat(styles.getPropertyValue(propertyName));

  return Number.isFinite(value) ? value : fallback;
}

export function useFixedHeaderTableLayout(
  className: string,
  wrapperClassName: string,
) {
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

      // Edge numeric columns use the heading as their spacing reference.
      // The scrollport already excludes native scrollbar space.
      const headerRow = tableElement.tHead?.rows[0];

      for (const [edge, heading] of [
        ["first", headerRow?.cells[0]],
        ["last", headerRow?.cells[headerRow.cells.length - 1]],
      ] as const) {
        const property = `--table-${edge}-number-heading-width`;

        if (heading?.classList.contains("numeric-column")) {
          const range = document.createRange();
          range.selectNodeContents(heading);
          const width = `${range.getBoundingClientRect().width}px`;

          if (tableElement.style.getPropertyValue(property) !== width) {
            tableElement.style.setProperty(property, width);
          }
        } else {
          tableElement.style.removeProperty(property);
        }
      }

      // Keep textual cells left aligned inside one shared trailing content width.
      // Its widest heading/value retains the fixed inset from the content frame.
      const lastHeading = headerRow?.cells[headerRow.cells.length - 1];
      if (lastHeading && !lastHeading.classList.contains("numeric-column")) {
        const range = document.createRange();
        let contentWidth = 0;

        for (const row of tableElement.rows) {
          const cell = row.cells[row.cells.length - 1];
          if (!cell) continue;
          range.selectNodeContents(cell);
          // Measure an action group itself, excluding any open popup overflow.
          const bounds = cell.firstElementChild?.getBoundingClientRect() ??
            range.getBoundingClientRect();
          contentWidth = Math.max(contentWidth, bounds.width);
        }

        const width = `${contentWidth}px`;
        if (
          tableElement.style.getPropertyValue("--table-last-content-width") !== width
        ) {
          tableElement.style.setProperty("--table-last-content-width", width);
        }
      } else {
        tableElement.style.removeProperty("--table-last-content-width");
      }

      const tableStyles = window.getComputedStyle(tableElement);
      const rootStyles = window.getComputedStyle(
        document.documentElement,
      );

      const minimumTableWidth = readPixelValue(
        tableStyles,
        "min-width",
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

  return { wrapperRef, scrollRef, tableRef };
}
