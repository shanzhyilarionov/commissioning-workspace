import type { CSSProperties } from "react";

export function progressWidthStyle(percent: number): CSSProperties {
  return { width: `${percent}%` };
}
