import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { jsPDF } from "jspdf";
import { autoTable, type CellInput } from "jspdf-autotable";
import type { Project } from "../types/project";
import type { ReportingIdentity } from "../types/reportingIdentity";
import type {
  ReportLinkedIssue,
  ReportRecordSummary,
  ReportTestItem,
  TestRecordReportBundle,
} from "../types/report";
import type { TestItemResult, TestRecordType } from "../types/testRecord";
import {
  PAGE_MARGIN,
  tableOptions,
  tableEnd,
  tableSectionHead,
  drawTableSection,
  drawPageNumbers,
  drawPdfTitle,
} from "./pdfLayout";

interface SaveTestRecordReportInput {
  project: Project;
  bundle: TestRecordReportBundle;
  reportingIdentity: ReportingIdentity;
}

function formatRecordType(recordType: TestRecordType): string {
  return recordType === "checklist" ? "Checklist" : "Functional test";
}

function formatResult(result: TestItemResult): string {
  switch (result) {
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "not_applicable":
      return "N/A";
    case "pending":
      return "Pending";
  }
}

function formatIssueStatus(status: ReportLinkedIssue["status"]): string {
  switch (status) {
    case "open":
      return "Open";
    case "in_progress":
      return "In progress";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
  }
}

function formatIssuePriority(priority: ReportLinkedIssue["priority"]): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatDateTime(value: string): string {
  if (!value.trim()) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function displayText(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized || "-";
}

function identityNameWithTitle(
  name: string,
  identity: ReportingIdentity,
): string {
  const normalizedName = name.trim();
  const title = identity.jobTitle.trim();
  const isCurrentOperator =
    normalizedName.localeCompare(identity.operatorName.trim(), undefined, {
      sensitivity: "base",
    }) === 0;

  return title && normalizedName && isCurrentOperator
    ? `${normalizedName}\n${title}`
    : normalizedName;
}

function sanitizeFileName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "");

  return (normalized || "commissioning-report").slice(0, 120);
}

function getLinkedIssueText(issue: ReportLinkedIssue | null): string {
  if (!issue) {
    return "-";
  }

  const details = [
    formatIssuePriority(issue.priority),
    formatIssueStatus(issue.status),
    issue.owner.trim() ? `Owner: ${issue.owner.trim()}` : null,
    issue.dueDate ? `Due: ${formatDate(issue.dueDate)}` : null,
  ].filter((value): value is string => value !== null);

  return `Issue: ${issue.title}\n${details.join(" | ")}`;
}

function drawFields(
  document: jsPDF,
  rows: string[][],
  startY: number,
): number {
  const options = tableOptions();
  autoTable(document, {
    ...options,
    startY,
    body: rows.map(([label, value]) => [label, displayText(value)]),
    columnStyles: {
      0: { ...options.headStyles, cellWidth: 24 },
    },
  });
  return tableEnd(document) + 9;
}

function drawInformation(
  document: jsPDF,
  project: Project,
  record: ReportRecordSummary,
): number {
  const pendingItemCount = Math.max(
    0,
    record.totalItemCount - record.passedItemCount -
      record.failedItemCount - record.notApplicableItemCount,
  );
  const rows = [
    [
      "Project",
      `${project.name}\nStatus: ${project.status.charAt(0).toUpperCase() + project.status.slice(1)}`,
    ],
    ["Record ID", record.id],
  ];
  if (project.client.trim()) rows.push(["Client", project.client]);
  if (project.location.trim()) rows.push(["Location", project.location]);
  const asset = [record.assetTag, record.assetName]
    .filter((value) => value?.trim()).join(" - ");
  if (asset) rows.push(["Asset", asset]);
  if (record.assetSystemName?.trim()) rows.push(["System", record.assetSystemName]);
  if (record.description.trim()) rows.push(["Record scope", record.description]);
  if (project.description.trim()) rows.push(["Project scope", project.description]);
  rows.push(["Results", [
    `${record.totalItemCount} total`,
    `${record.passedItemCount} passed`,
    `${record.failedItemCount} failed`,
    `${record.notApplicableItemCount} N/A`,
    pendingItemCount > 0 ? `${pendingItemCount} pending` : "",
  ].filter(Boolean).join(" | ")]);

  return drawFields(document, rows, tableEnd(document) + 3);
}

function buildTableRows(items: ReportTestItem[]): string[][] {
  return items.map((item, index) => [
    String(index + 1),
    [
      displayText(item.description),
      item.acceptanceCriteria.trim()
        ? `Acceptance: ${item.acceptanceCriteria.trim()}` : "",
    ].filter(Boolean).join("\n"),
    formatResult(item.result),
    [
      item.notes.trim(),
      item.linkedIssue ? getLinkedIssueText(item.linkedIssue) : "",
    ].filter(Boolean).join("\n") || "-",
  ]);
}

function drawSignoff(
  document: jsPDF,
  record: ReportRecordSummary,
  reportingIdentity: ReportingIdentity,
  startY: number,
): void {
  const body: CellInput[][] = [
    [
      [displayText(record.executedBy), formatDate(record.executionDate)].join("\n"),
      displayText(record.witnessedBy),
      [
        displayText(identityNameWithTitle(record.signedOffBy, reportingIdentity)),
        formatDateTime(record.signedOffAt),
      ].join("\n"),
    ],
    [{
      content: `Final result: ${record.failedItemCount > 0 ? "Completed with linked deficiencies" : "Completed"}`,
      colSpan: 3,
    }],
  ];
  if (record.completionNotes.trim()) {
    body.push([{ content: `Completion notes: ${record.completionNotes.trim()}`, colSpan: 3 }]);
  }
  const nameColumnWidth = (document.internal.pageSize.getWidth() - PAGE_MARGIN * 2 - 50) / 2;
  autoTable(document, {
    ...tableOptions(),
    startY,
    head: tableSectionHead("Completion and sign-off", ["Executed", "Witnessed by", "Signed off"]),
    body,
    columnStyles: {
      0: { cellWidth: nameColumnWidth },
      1: { cellWidth: 50 },
      2: { cellWidth: nameColumnWidth },
    },
    pageBreak: "avoid",
  });
}

export function createTestRecordReportPdf({
  project,
  bundle,
  reportingIdentity,
}: SaveTestRecordReportInput): jsPDF {
  const { record, items } = bundle;
  const document = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  document.setProperties({
    title: `${record.title} - Completion Report`,
    subject: `${formatRecordType(record.recordType)} completion report`,
    author: record.signedOffBy,
    creator: "Commissioning Workspace",
  });

  drawPdfTitle(
    document,
    record.title.trim() || "Record Report",
    `${formatRecordType(record.recordType)} completion report`.toUpperCase(),
    reportingIdentity.organization,
  );
  let y = drawInformation(document, project, record);
  y = drawTableSection(
    document,
    "Checklist and test items",
    ["No.", "Item / Acceptance criteria", "Result", "Notes / Linked issue"],
    buildTableRows(items),
    y,
    [9, 0, 18, 66],
  );
  drawSignoff(document, record, reportingIdentity, y);
  drawPageNumbers(document);
  return document;
}

export async function saveTestRecordReport(
  input: SaveTestRecordReportInput,
): Promise<string | null> {
  const { project, bundle } = input;
  const defaultFileName = `${sanitizeFileName(project.name)} - ${sanitizeFileName(
    bundle.record.title,
  )}.pdf`;
  const path = await save({
    title: "Save commissioning report",
    defaultPath: defaultFileName,
    filters: [
      {
        name: "PDF document",
        extensions: ["pdf"],
      },
    ],
  });

  if (!path) {
    return null;
  }

  const outputPath = path.toLowerCase().endsWith(".pdf") ? path : `${path}.pdf`;
  const document = createTestRecordReportPdf(input);
  const arrayBuffer = document.output("arraybuffer");
  const bytes = Array.from(new Uint8Array(arrayBuffer));

  await invoke("save_report_pdf", {
    path: outputPath,
    bytes,
  });

  return outputPath;
}
