import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { jsPDF } from "jspdf";
import { autoTable, type Table } from "jspdf-autotable";
import type { Project } from "../types/project";
import type {
  ReportLinkedIssue,
  ReportRecordSummary,
  ReportTestItem,
  TestRecordReportBundle,
} from "../types/report";
import type { TestItemResult, TestRecordType } from "../types/testRecord";

interface SaveTestRecordReportInput {
  project: Project;
  bundle: TestRecordReportBundle;
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
    return "—";
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
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayText(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized || "—";
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
    return "—";
  }

  const details = [
    formatIssuePriority(issue.priority),
    formatIssueStatus(issue.status),
    issue.owner.trim() ? `Owner: ${issue.owner.trim()}` : null,
    issue.dueDate ? `Due: ${formatDate(issue.dueDate)}` : null,
  ].filter((value): value is string => value !== null);

  return `${issue.title}\n${details.join(" · ")}`;
}

function fitText(
  document: jsPDF,
  value: string,
  width: number,
  maximumLines: number,
): string[] {
  const lines = document.splitTextToSize(displayText(value), width) as string[];

  if (lines.length <= maximumLines) {
    return lines;
  }

  const visibleLines = lines.slice(0, maximumLines);
  const finalLine = visibleLines[maximumLines - 1];
  visibleLines[maximumLines - 1] = `${finalLine.slice(0, Math.max(0, finalLine.length - 1))}…`;
  return visibleLines;
}

function drawHeader(
  document: jsPDF,
  project: Project,
  record: ReportRecordSummary,
): number {
  const pageWidth = document.internal.pageSize.getWidth();
  const margin = 12;

  document.setTextColor(26, 26, 26);
  document.setFont("helvetica", "bold");
  document.setFontSize(7.5);
  document.text("COMMISSIONING WORKSPACE", margin, 12);

  document.setFontSize(18);
  document.text(
    fitText(document, record.title, pageWidth - 105, 1),
    margin,
    20,
  );

  document.setFont("helvetica", "normal");
  document.setFontSize(8.5);
  document.setTextColor(92, 92, 92);
  document.text(
    `${formatRecordType(record.recordType)} completion report`,
    margin,
    26,
  );

  document.setFontSize(7.5);
  document.text(`Project: ${project.name}`, pageWidth - margin, 12, {
    align: "right",
  });
  document.text(`Record ID: ${record.id}`, pageWidth - margin, 17, {
    align: "right",
  });
  document.text(`Signed: ${formatDateTime(record.signedOffAt)}`, pageWidth - margin, 22, {
    align: "right",
  });

  document.setDrawColor(30, 30, 30);
  document.setLineWidth(0.6);
  document.line(margin, 30, pageWidth - margin, 30);
  return 36;
}

function drawField(
  document: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
): void {
  document.setDrawColor(215, 215, 215);
  document.setLineWidth(0.2);
  document.rect(x, y, width, height);

  document.setFont("helvetica", "bold");
  document.setFontSize(6.5);
  document.setTextColor(110, 110, 110);
  document.text(label.toUpperCase(), x + 3, y + 4.2);

  document.setFont("helvetica", "normal");
  document.setFontSize(8.2);
  document.setTextColor(28, 28, 28);
  document.text(fitText(document, value, width - 6, 3), x + 3, y + 9);
}

function drawInformation(
  document: jsPDF,
  project: Project,
  record: ReportRecordSummary,
  startY: number,
): number {
  const margin = 12;
  const availableWidth = document.internal.pageSize.getWidth() - margin * 2;
  const columnWidth = availableWidth / 4;
  const rowHeight = 16;
  const fields = [
    ["Project", project.name],
    ["Client", project.client],
    ["Location", project.location],
    ["Project status", project.status],
    ["Asset tag", record.assetTag ?? ""],
    ["Asset name", record.assetName ?? ""],
    ["System", record.assetSystemName ?? ""],
    ["Execution date", formatDate(record.executionDate)],
  ] as const;

  fields.forEach(([label, value], index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    drawField(
      document,
      margin + column * columnWidth,
      startY + row * rowHeight,
      columnWidth,
      rowHeight,
      label,
      value,
    );
  });

  const descriptionY = startY + rowHeight * 2 + 3;
  drawField(
    document,
    margin,
    descriptionY,
    availableWidth / 2,
    19,
    "Record description",
    record.description,
  );
  drawField(
    document,
    margin + availableWidth / 2,
    descriptionY,
    availableWidth / 2,
    19,
    "Project description",
    project.description,
  );

  return descriptionY + 24;
}

function drawSummary(
  document: jsPDF,
  record: ReportRecordSummary,
  startY: number,
): number {
  const margin = 12;
  const gap = 3;
  const availableWidth = document.internal.pageSize.getWidth() - margin * 2;
  const cardWidth = (availableWidth - gap * 3) / 4;
  const cards = [
    ["Total", record.totalItemCount],
    ["Passed", record.passedItemCount],
    ["Failed", record.failedItemCount],
    ["Not applicable", record.notApplicableItemCount],
  ] as const;

  cards.forEach(([label, value], index) => {
    const x = margin + index * (cardWidth + gap);
    document.setFillColor(245, 245, 245);
    document.setDrawColor(220, 220, 220);
    document.roundedRect(x, startY, cardWidth, 14, 1.5, 1.5, "FD");

    document.setFont("helvetica", "bold");
    document.setFontSize(6.5);
    document.setTextColor(105, 105, 105);
    document.text(label.toUpperCase(), x + 3, startY + 4.2);

    document.setFontSize(12);
    document.setTextColor(28, 28, 28);
    document.text(String(value), x + 3, startY + 11);
  });

  return startY + 20;
}

function drawSectionTitle(document: jsPDF, title: string, y: number): void {
  document.setFont("helvetica", "bold");
  document.setFontSize(8);
  document.setTextColor(35, 35, 35);
  document.text(title.toUpperCase(), 12, y);
}

function buildTableRows(items: ReportTestItem[]): string[][] {
  return items.map((item, index) => [
    String(index + 1),
    displayText(item.description),
    displayText(item.acceptanceCriteria),
    formatResult(item.result),
    displayText(item.notes),
    getLinkedIssueText(item.linkedIssue),
  ]);
}

function ensureVerticalSpace(
  document: jsPDF,
  currentY: number,
  requiredHeight: number,
): number {
  const pageHeight = document.internal.pageSize.getHeight();

  if (currentY + requiredHeight <= pageHeight - 14) {
    return currentY;
  }

  document.addPage();
  return 16;
}

function drawSignoff(
  document: jsPDF,
  record: ReportRecordSummary,
  startY: number,
): number {
  const margin = 12;
  const availableWidth = document.internal.pageSize.getWidth() - margin * 2;
  const columnWidth = availableWidth / 3;
  const y = ensureVerticalSpace(document, startY, 43);

  drawSectionTitle(document, "Completion and sign-off", y);
  const fieldsY = y + 4;
  const fields = [
    ["Executed by", record.executedBy],
    ["Witnessed by", record.witnessedBy],
    ["Execution date", formatDate(record.executionDate)],
    ["Signed off by", record.signedOffBy],
    ["Signed off at", formatDateTime(record.signedOffAt)],
    [
      "Final result",
      record.failedItemCount > 0
        ? "Completed with linked deficiencies"
        : "Completed",
    ],
  ] as const;

  fields.forEach(([label, value], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    drawField(
      document,
      margin + column * columnWidth,
      fieldsY + row * 15,
      columnWidth,
      15,
      label,
      value,
    );
  });

  drawField(
    document,
    margin,
    fieldsY + 33,
    availableWidth,
    17,
    "Completion notes",
    record.completionNotes,
  );

  return fieldsY + 53;
}

function drawPageFooters(
  document: jsPDF,
  project: Project,
  record: ReportRecordSummary,
): void {
  const totalPages = document.getNumberOfPages();
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    document.setPage(pageNumber);
    document.setDrawColor(220, 220, 220);
    document.setLineWidth(0.2);
    document.line(12, pageHeight - 10, pageWidth - 12, pageHeight - 10);

    document.setFont("helvetica", "normal");
    document.setFontSize(6.5);
    document.setTextColor(120, 120, 120);
    document.text(
      `${project.name} · ${record.title}`,
      12,
      pageHeight - 6,
      { maxWidth: pageWidth - 55 },
    );
    document.text(
      `Page ${pageNumber} of ${totalPages}`,
      pageWidth - 12,
      pageHeight - 6,
      { align: "right" },
    );
  }
}

function createPdf({ project, bundle }: SaveTestRecordReportInput): jsPDF {
  const { record, items } = bundle;
  const document = new jsPDF({
    orientation: "landscape",
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

  let y = drawHeader(document, project, record);
  y = drawInformation(document, project, record, y);
  y = drawSummary(document, record, y);
  drawSectionTitle(document, "Checklist and test items", y);

  autoTable(document, {
    startY: y + 3,
    head: [
      [
        "No.",
        "Item",
        "Acceptance criteria",
        "Result",
        "Notes",
        "Linked issue",
      ],
    ],
    body: buildTableRows(items),
    theme: "grid",
    margin: {
      left: 12,
      right: 12,
      top: 12,
      bottom: 15,
    },
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 2.2,
      lineColor: [210, 210, 210],
      lineWidth: 0.2,
      textColor: [35, 35, 35],
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [28, 28, 28],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 6.5,
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 55 },
      2: { cellWidth: 55 },
      3: { cellWidth: 18, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 60 },
      5: { cellWidth: 75 },
    },
  });

  const tableFinalY = (document as jsPDF & { lastAutoTable?: Table })
    .lastAutoTable?.finalY;

  drawSignoff(document, record, (tableFinalY ?? 88) + 8);
  drawPageFooters(document, project, record);
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

  const outputPath = path.toLowerCase().endsWith(".pdf")
    ? path
    : `${path}.pdf`;
  const document = createPdf(input);
  const arrayBuffer = document.output("arraybuffer");
  const bytes = Array.from(new Uint8Array(arrayBuffer));

  await invoke("save_report_pdf", {
    path: outputPath,
    bytes,
  });

  return outputPath;
}
