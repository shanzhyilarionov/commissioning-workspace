import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { AuditEntityType, AuditEvent } from "../types/audit";
import {
  formatAuditDetailValue,
  formatAuditFieldName,
  getAuditEventDetails,
} from "./auditEventDetails";

interface SaveAuditHistoryCsvInput {
  projectName: string;
  events: AuditEvent[];
}

function formatAction(action: string): string {
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatEntity(type: AuditEntityType): string {
  switch (type) {
    case "project":
      return "Project";
    case "system":
      return "System";
    case "subsystem":
      return "Subsystem";
    case "asset":
      return "Asset";
    case "issue":
      return "Issue";
    case "test_record":
      return "Test record";
    case "test_item":
      return "Test item";
    case "document":
      return "Document";
    case "turnover_package":
      return "Turnover package";
  }
}

function sanitizeFileName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "");

  return (normalized || "commissioning-project").slice(0, 120);
}

function protectSpreadsheetFormula(value: string): string {
  const firstCharacter = value.trimStart().charAt(0);
  return ["=", "+", "-", "@"].includes(firstCharacter)
    ? `'${value}`
    : value;
}

function csvCell(value: string): string {
  return `"${protectSpreadsheetFormula(value).replace(/"/g, '""')}"`;
}

function formatChanges(event: AuditEvent): string {
  return getAuditEventDetails(event)
    .changes.map(
      (change) =>
        `${formatAuditFieldName(change.field)}: ${formatAuditDetailValue(
          change.before,
        )} -> ${formatAuditDetailValue(change.after)}`,
    )
    .join(" | ");
}

function formatRecordedValues(event: AuditEvent): string {
  return getAuditEventDetails(event)
    .values.map(
      (detail) =>
        `${formatAuditFieldName(detail.field)}: ${formatAuditDetailValue(
          detail.value,
        )}`,
    )
    .join(" | ");
}

export function createAuditHistoryCsv(
  projectName: string,
  events: AuditEvent[],
): string {
  const header = [
    "Project",
    "Timestamp (UTC)",
    "Operator",
    "Action",
    "Entity type",
    "Record",
    "Reason",
    "Changes",
    "Recorded values",
    "Entity ID",
    "Parent entity ID",
    "Event ID",
  ];
  const rows = events.map((event) => [
    projectName,
    event.createdAt,
    event.actor || "Unknown operator",
    formatAction(event.action),
    formatEntity(event.entityType),
    event.entityLabel || "Untitled record",
    event.reason,
    formatChanges(event),
    formatRecordedValues(event),
    event.entityId,
    event.parentEntityId ?? "",
    event.id,
  ]);

  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}\r\n`;
}

export async function saveAuditHistoryCsv({
  projectName,
  events,
}: SaveAuditHistoryCsvInput): Promise<string | null> {
  if (events.length === 0) {
    throw new Error("There are no audit records to export.");
  }

  const defaultFileName = `${sanitizeFileName(projectName)} - Audit history.csv`;
  const path = await save({
    title: "Export audit history",
    defaultPath: defaultFileName,
    filters: [
      {
        name: "CSV document",
        extensions: ["csv"],
      },
    ],
  });

  if (!path) {
    return null;
  }

  const outputPath = path.toLowerCase().endsWith(".csv")
    ? path
    : `${path}.csv`;
  const bytes = Array.from(
    new TextEncoder().encode(createAuditHistoryCsv(projectName, events)),
  );

  await invoke("save_audit_history_csv", {
    path: outputPath,
    bytes,
  });

  return outputPath;
}
