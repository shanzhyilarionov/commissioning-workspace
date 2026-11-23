import { useEffect, useRef, useState, type CSSProperties } from "react";

export function useWeeklyActivityChartLayout(pointCount: number) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(660);
  const tickCount =
    containerWidth >= 1200
      ? 9
      : containerWidth >= 850
        ? 7
        : containerWidth >= 560
          ? 5
          : 3;
  const showDataPoints = containerWidth >= 560;
  const labelCount = Math.min(
    pointCount,
    Math.max(2, Math.floor((containerWidth - 96) / 82)),
  );
  const labelIndexes = new Set(
    Array.from({ length: labelCount }, (_, index) =>
      labelCount <= 1
        ? 0
        : Math.round(
            (index * (pointCount - 1)) /
              (labelCount - 1),
          ),
    ),
  );
  const plotPixelHeight = Math.round(
    Math.min(165, Math.max(115, containerWidth * 0.27)),
  );
  const width = 660;
  const height = 170;
  const chartLeft = 4;
  const chartRight = 38;
  const chartTop = 6;
  const chartBottom = 4;
  const chartWidth = width - chartLeft - chartRight;
  const chartHeight = height - chartTop - chartBottom;

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });

    observer.observe(container);
    setContainerWidth(container.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  const plotStyle: CSSProperties = { height: `${plotPixelHeight}px` };
  const labelsStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${pointCount}, minmax(0, 1fr))`,
  };

  return {
    containerRef,
    tickCount,
    showDataPoints,
    labelIndexes,
    width,
    height,
    chartLeft,
    chartTop,
    chartWidth,
    chartHeight,
    pointRadius: 0.01,
    plotStyle,
    labelsStyle,
  };
}
