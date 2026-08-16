import type { AuditEvent } from "../types/audit";

export interface AuditChangeDetail {
  field: string;
  before: unknown;
  after: unknown;
}

export interface AuditValueDetail {
  field: string;
  value: unknown;
}

export interface AuditEventDetails {
  changes: AuditChangeDetail[];
  values: AuditValueDetail[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valuesMatch(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export function formatAuditFieldName(field: string): string {
  const spaced = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!spaced) {
    return "Field";
  }

  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function formatAuditDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string") {
    if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(value)) {
      return value
        .split("_")
        .map((part, index) =>
          index === 0
            ? part.charAt(0).toUpperCase() + part.slice(1)
            : part,
        )
        .join(" ");
    }

    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function getAuditEventDetails(
  event: Pick<AuditEvent, "detailsJson">,
): AuditEventDetails {
  let parsed: unknown;

  try {
    parsed = JSON.parse(event.detailsJson);
  } catch {
    return { changes: [], values: [] };
  }

  if (!isRecord(parsed)) {
    return { changes: [], values: [] };
  }

  const changes: AuditChangeDetail[] = [];
  const excludedKeys = new Set<string>();
  const before = parsed.before;
  const after = parsed.after;
  const beforeRecord = isRecord(before) ? before : null;
  const afterRecord = isRecord(after) ? after : null;

  if (beforeRecord || afterRecord) {
    excludedKeys.add("before");
    excludedKeys.add("after");

    const fields = new Set([
      ...Object.keys(beforeRecord ?? {}),
      ...Object.keys(afterRecord ?? {}),
    ]);

    for (const field of fields) {
      const beforeValue = beforeRecord?.[field];
      const afterValue = afterRecord?.[field];

      if (!valuesMatch(beforeValue, afterValue)) {
        changes.push({
          field,
          before: beforeValue,
          after: afterValue,
        });
      }
    }
  }

  for (const [key, beforeValue] of Object.entries(parsed)) {
    if (!key.startsWith("before") || key === "before") {
      continue;
    }

    const suffix = key.slice("before".length);
    const afterKey = `after${suffix}`;

    if (!suffix || !(afterKey in parsed)) {
      continue;
    }

    excludedKeys.add(key);
    excludedKeys.add(afterKey);

    if (!valuesMatch(beforeValue, parsed[afterKey])) {
      changes.push({
        field: lowerFirst(suffix),
        before: beforeValue,
        after: parsed[afterKey],
      });
    }
  }

  const values = Object.entries(parsed)
    .filter(
      ([key]) =>
        !excludedKeys.has(key) &&
        key !== "recordId" &&
        !key.endsWith("_id"),
    )
    .map(([field, value]) => ({ field, value }));

  return { changes, values };
}
