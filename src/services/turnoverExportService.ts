import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { jsPDF } from "jspdf";
import { autoTable, type Table } from "jspdf-autotable";
import type { ReadinessBlockerType } from "../types/readiness";
import type { ReportingIdentity } from "../types/reportingIdentity";
import type { CommissioningStage } from "../types/system";
import type { TurnoverPackage } from "../types/turnover";
import { exportColors } from "./exportTheme";

interface SaveTurnoverPackageInput {
  turnoverPackage: TurnoverPackage;
}

const PRODUCT_NAME = "Commissioning Workspace";

function displayText(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized || "-";
}

function packageReportingIdentity(
  turnoverPackage: TurnoverPackage,
): ReportingIdentity {
  return (
    turnoverPackage.snapshot.reportingIdentity ?? {
      operatorName: turnoverPackage.preparedBy,
      organization: "",
      jobTitle: "",
    }
  );
}

function reportingBrand(identity: ReportingIdentity): string {
  return identity.organization.trim() || PRODUCT_NAME;
}

function preparedByWithTitle(
  turnoverPackage: TurnoverPackage,
  identity: ReportingIdentity,
): string {
  const preparedBy = turnoverPackage.preparedBy.trim();
  const title = identity.jobTitle.trim();
  const isCurrentOperator =
    preparedBy.localeCompare(identity.operatorName.trim(), undefined, {
      sensitivity: "base",
    }) === 0;

  return title && preparedBy && isCurrentOperator
    ? `${preparedBy}\n${title}`
    : preparedBy;
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

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatStage(stage: CommissioningStage): string {
  switch (stage) {
    case "not_started":
      return "Not started";
    case "in_progress":
      return "In progress";
    case "ready":
      return "Ready";
    case "commissioned":
      return "Commissioned";
    case "handed_over":
      return "Handed over";
  }
}

function formatBlockerType(type: ReadinessBlockerType): string {
  switch (type) {
    case "no_assets":
      return "Structure";
    case "incomplete_asset":
      return "Asset";
    case "pending_test_item":
      return "Pending test";
    case "failed_test_item":
      return "Failed test";
    case "unsigned_test_record":
      return "Unsigned record";
    case "critical_issue":
      return "Critical issue";
    case "required_document":
      return "Required document";
  }
}

function sanitizeFileName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "");

  return (normalized || "turnover-package").slice(0, 120);
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
  visibleLines[maximumLines - 1] = `${finalLine.slice(
    0,
    Math.max(0, finalLine.length - 3),
  )}...`;
  return visibleLines;
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
  document.setDrawColor(...exportColors.fieldBorder);
  document.setLineWidth(0.2);
  document.rect(x, y, width, height);

  document.setFont("helvetica", "bold");
  document.setFontSize(6.5);
  document.setTextColor(...exportColors.label);
  document.text(label.toUpperCase(), x + 3, y + 4.2);

  document.setFont("helvetica", "normal");
  document.setFontSize(8.2);
  document.setTextColor(...exportColors.primary);
  document.text(fitText(document, value, width - 6, 3), x + 3, y + 9);
}

function drawCover(document: jsPDF, turnoverPackage: TurnoverPackage): void {
  const { snapshot } = turnoverPackage;
  const reportingIdentity = packageReportingIdentity(turnoverPackage);
  const pageWidth = document.internal.pageSize.getWidth();
  const margin = 16;
  const availableWidth = pageWidth - margin * 2;

  document.setTextColor(...exportColors.heading);
  document.setFont("helvetica", "bold");
  document.setFontSize(8);
  document.text(
    fitText(
      document,
      reportingBrand(reportingIdentity).toUpperCase(),
      availableWidth - 90,
      1,
    ),
    margin,
    15,
  );

  if (reportingIdentity.organization.trim()) {
    document.setFont("helvetica", "normal");
    document.setFontSize(5.5);
    document.setTextColor(...exportColors.muted);
    document.text(
      "GENERATED WITH COMMISSIONING WORKSPACE",
      pageWidth - margin,
      15,
      { align: "right" },
    );
  }

  document.setTextColor(...exportColors.heading);
  document.setFont("helvetica", "bold");
  document.setFontSize(23);
  document.text("System Turnover Package", margin, 29);

  document.setFont("helvetica", "normal");
  document.setFontSize(10);
  document.setTextColor(...exportColors.secondary);
  document.text(
    `${formatLabel(snapshot.scope.kind)} commissioning and handover dossier`,
    margin,
    36,
  );

  const statusText = turnoverPackage.status.toUpperCase();
  if (turnoverPackage.status === "final") {
    document.setFillColor(...exportColors.statusPositive);
  } else if (turnoverPackage.status === "void") {
    document.setFillColor(...exportColors.statusNegative);
  } else {
    document.setFillColor(...exportColors.statusNeutral);
  }
  document.roundedRect(pageWidth - margin - 28, 18, 28, 10, 2, 2, "F");
  document.setFont("helvetica", "bold");
  document.setFontSize(7.5);
  document.setTextColor(...exportColors.onStrong);
  document.text(statusText, pageWidth - margin - 14, 24.4, { align: "center" });

  document.setDrawColor(...exportColors.divider);
  document.setLineWidth(0.7);
  document.line(margin, 43, pageWidth - margin, 43);

  const columnWidth = availableWidth / 4;
  const fields = [
    ["Package number", turnoverPackage.packageNumber],
    ["Revision", turnoverPackage.revision],
    ["Generated", formatDateTime(turnoverPackage.generatedAt)],
    ["Stage", formatStage(turnoverPackage.stageAtGeneration)],
    ["Project", snapshot.project.name],
    ["Client", snapshot.project.client],
    ["Location", snapshot.project.location],
    ["Project status", formatLabel(snapshot.project.status)],
    ["Scope code", snapshot.scope.code],
    ["Scope name", snapshot.scope.name],
    ["Parent system", snapshot.scope.parentSystemName],
    ["Assets", String(snapshot.assets.length)],
  ];

  fields.forEach(([label, value], index) => {
    drawField(
      document,
      margin + (index % 4) * columnWidth,
      49 + Math.floor(index / 4) * 16,
      columnWidth,
      16,
      label,
      value,
    );
  });

  drawField(
    document,
    margin,
    100,
    availableWidth / 2,
    21,
    "Scope description",
    snapshot.scope.description,
  );
  drawField(
    document,
    margin + availableWidth / 2,
    100,
    availableWidth / 2,
    21,
    "Package notes",
    turnoverPackage.notes,
  );

  const readinessY = 130;
  document.setFont("helvetica", "bold");
  document.setFontSize(8);
  document.setTextColor(...exportColors.section);
  document.text("READINESS SUMMARY", margin, readinessY);

  const readinessCards = [
    ["Current blockers", turnoverPackage.blockerCount],
    ["Stage records", snapshot.readiness.stageRecords.length],
    ["Forced transitions", turnoverPackage.forcedTransitionCount],
    ["Test records", snapshot.testRecords.length],
    ["Issues", snapshot.issues.length],
    ["Documents", snapshot.documents.length],
  ] as const;
  const gap = 3;
  const cardWidth = (availableWidth - gap * 5) / 6;

  readinessCards.forEach(([label, value], index) => {
    const x = margin + index * (cardWidth + gap);
    document.setFillColor(...exportColors.surfaceSubtle);
    document.setDrawColor(...exportColors.borderSubtle);
    document.roundedRect(x, readinessY + 4, cardWidth, 18, 1.5, 1.5, "FD");
    document.setFont("helvetica", "bold");
    document.setFontSize(6.2);
    document.setTextColor(...exportColors.label);
    document.text(label.toUpperCase(), x + 3, readinessY + 9);
    document.setFontSize(12);
    document.setTextColor(...exportColors.primary);
    document.text(String(value), x + 3, readinessY + 18);
  });

  if (turnoverPackage.forcedTransitionCount > 0) {
    document.setFillColor(...exportColors.warningBackground);
    document.setDrawColor(...exportColors.warningBorder);
    document.roundedRect(margin, 160, availableWidth, 15, 1.5, 1.5, "FD");
    document.setFont("helvetica", "bold");
    document.setFontSize(7.5);
    document.setTextColor(...exportColors.warningText);
    document.text(
      `${turnoverPackage.forcedTransitionCount} forced stage transition${
        turnoverPackage.forcedTransitionCount === 1 ? " is" : "s are"
      } recorded in this package. Review the stage history and recorded reasons.`,
      margin + 4,
      169,
    );
  }

  const signoffY = turnoverPackage.forcedTransitionCount > 0 ? 181 : 165;
  const signoffWidth = availableWidth / 2;
  drawField(
    document,
    margin,
    signoffY,
    signoffWidth,
    16,
    "Prepared by",
    preparedByWithTitle(turnoverPackage, reportingIdentity),
  );
  drawField(
    document,
    margin + signoffWidth,
    signoffY,
    signoffWidth,
    16,
    "Approved by",
    turnoverPackage.approvedBy,
  );
}

function ensureVerticalSpace(
  document: jsPDF,
  currentY: number,
  requiredHeight: number,
): number {
  const pageHeight = document.internal.pageSize.getHeight();

  if (currentY + requiredHeight <= pageHeight - 16) {
    return currentY;
  }

  document.addPage();
  return 16;
}

function drawSectionTitle(document: jsPDF, title: string, y: number): void {
  document.setFont("helvetica", "bold");
  document.setFontSize(8.5);
  document.setTextColor(...exportColors.section);
  document.text(title.toUpperCase(), 12, y);
}

function drawTableSection(
  document: jsPDF,
  title: string,
  head: string[],
  body: string[][],
  startY: number,
  columnStyles: Record<
    number,
    { cellWidth?: number; halign?: "left" | "center" | "right" }
  > = {},
): number {
  const y = ensureVerticalSpace(document, startY, body.length === 0 ? 16 : 28);
  drawSectionTitle(document, title, y);

  if (body.length === 0) {
    document.setFont("helvetica", "normal");
    document.setFontSize(7.5);
    document.setTextColor(...exportColors.label);
    document.text("No records captured for this section.", 12, y + 6);
    return y + 13;
  }

  autoTable(document, {
    startY: y + 3,
    head: [head],
    body,
    theme: "grid",
    margin: {
      left: 12,
      right: 12,
      top: 13,
      bottom: 15,
    },
    styles: {
      font: "helvetica",
      fontSize: 6.6,
      cellPadding: 2,
      lineColor: exportColors.tableBorder,
      lineWidth: 0.2,
      textColor: exportColors.section,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: exportColors.primary,
      textColor: exportColors.onStrong,
      fontStyle: "bold",
      fontSize: 6.3,
    },
    alternateRowStyles: {
      fillColor: exportColors.surfaceAlternate,
    },
    columnStyles,
  });

  const finalY = (document as jsPDF & { lastAutoTable?: Table }).lastAutoTable
    ?.finalY;
  return (finalY ?? y + 12) + 8;
}

function drawPackageContents(
  document: jsPDF,
  turnoverPackage: TurnoverPackage,
): void {
  const { snapshot } = turnoverPackage;
  document.addPage();
  let y = 16;

  if (turnoverPackage.status === "void") {
    y = drawTableSection(
      document,
      "Package lifecycle record",
      ["Status", "Voided", "Reason"],
      [
        [
          "VOID",
          formatDateTime(turnoverPackage.voidedAt ?? ""),
          displayText(turnoverPackage.voidReason),
        ],
      ],
      y,
      {
        0: { cellWidth: 24 },
        1: { cellWidth: 42 },
      },
    );
  }

  y = drawTableSection(
    document,
    "Commissioning stage history",
    ["Transition", "Recorded by", "Date", "Forced", "Blockers", "Reason"],
    snapshot.readiness.stageRecords.map((record) => [
      `${formatStage(record.fromStage)} to ${formatStage(record.toStage)}`,
      displayText(record.recordedBy),
      formatDateTime(record.createdAt),
      record.forced ? "Yes" : "No",
      String(record.blockerCount),
      displayText(record.reason),
    ]),
    y,
    {
      0: { cellWidth: 39 },
      2: { cellWidth: 32 },
      3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 17, halign: "center" },
    },
  );

  y = drawTableSection(
    document,
    "Readiness blockers at generation",
    ["Type", "Record", "Status", "Detail"],
    snapshot.readiness.blockers.map((blocker) => [
      formatBlockerType(blocker.type),
      blocker.title,
      formatLabel(blocker.status),
      blocker.detail,
    ]),
    y,
    {
      0: { cellWidth: 31 },
      2: { cellWidth: 24 },
    },
  );

  y = drawTableSection(
    document,
    "Asset register",
    ["Tag", "Asset", "Type", "System", "Subsystem", "Status"],
    snapshot.assets.map((asset) => [
      asset.tag,
      asset.name,
      displayText(asset.assetType),
      [asset.systemCode, asset.systemName].filter(Boolean).join(" - "),
      [asset.subsystemCode, asset.subsystemName].filter(Boolean).join(" - "),
      formatLabel(asset.status),
    ]),
    y,
    {
      0: { cellWidth: 25 },
      2: { cellWidth: 31 },
      5: { cellWidth: 22 },
    },
  );

  y = drawTableSection(
    document,
    "Checklist and functional test register",
    ["Asset", "Record", "Type", "Items", "Executed", "Signed off", "Status"],
    snapshot.testRecords.map((record) => [
      displayText(record.assetTag),
      record.title,
      record.recordType === "checklist" ? "Checklist" : "Functional test",
      `${record.passedItemCount}/${record.totalItemCount} passed${
        record.failedItemCount > 0 ? `, ${record.failedItemCount} failed` : ""
      }`,
      `${displayText(record.executedBy)}\n${formatDate(record.executionDate)}`,
      displayText(record.signedOffBy),
      record.signedOffAt ? "Signed" : "Unsigned",
    ]),
    y,
    {
      0: { cellWidth: 23 },
      2: { cellWidth: 28 },
      3: { cellWidth: 28 },
      4: { cellWidth: 34 },
      6: { cellWidth: 20 },
    },
  );

  y = drawTableSection(
    document,
    "Issue and exception register",
    ["Asset", "Issue", "Priority", "Status", "Owner", "Due date"],
    snapshot.issues.map((issue) => [
      displayText(issue.assetTag),
      issue.title,
      formatLabel(issue.priority),
      formatLabel(issue.status),
      displayText(issue.owner),
      formatDate(issue.dueDate),
    ]),
    y,
    {
      0: { cellWidth: 25 },
      2: { cellWidth: 22 },
      3: { cellWidth: 25 },
      5: { cellWidth: 25 },
    },
  );

  y = drawTableSection(
    document,
    "Document index",
    [
      "Asset",
      "Document",
      "Category",
      "Revision",
      "Status",
      "Readiness",
      "File",
    ],
    snapshot.documents.map((projectDocument) => [
      projectDocument.assetTag || "Project",
      projectDocument.title,
      formatLabel(projectDocument.category),
      displayText(projectDocument.revision),
      formatLabel(projectDocument.status),
      projectDocument.requiredForReadiness ? "Required" : "Supporting",
      projectDocument.originalFileName,
    ]),
    y,
    {
      0: { cellWidth: 23 },
      2: { cellWidth: 25 },
      3: { cellWidth: 17 },
      4: { cellWidth: 22 },
      5: { cellWidth: 23 },
    },
  );

  if (snapshot.auditEvents && snapshot.auditEvents.length > 0) {
    drawTableSection(
      document,
      "Audit trail",
      ["Time", "Record type", "Record", "Action", "Operator", "Reason"],
      snapshot.auditEvents.map((event) => [
        formatDateTime(event.createdAt),
        formatLabel(event.entityType),
        displayText(event.entityLabel),
        formatLabel(event.action),
        displayText(event.actor),
        displayText(event.reason),
      ]),
      y,
      {
        0: { cellWidth: 32 },
        1: { cellWidth: 25 },
        3: { cellWidth: 24 },
        4: { cellWidth: 28 },
      },
    );
  }
}

function drawPageFurniture(
  document: jsPDF,
  turnoverPackage: TurnoverPackage,
): void {
  const totalPages = document.getNumberOfPages();
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    document.setPage(pageNumber);

    const watermark =
      turnoverPackage.status === "draft"
        ? "DRAFT"
        : turnoverPackage.status === "void"
          ? "VOID"
          : null;

    if (watermark) {
      document.setFont("helvetica", "bold");
      document.setFontSize(48);
      if (turnoverPackage.status === "void") {
        document.setTextColor(...exportColors.watermarkNegative);
      } else {
        document.setTextColor(...exportColors.watermarkNeutral);
      }
      document.text(watermark, pageWidth / 2, pageHeight / 2, {
        align: "center",
        angle: 32,
      });
    }

    document.setDrawColor(...exportColors.borderSubtle);
    document.setLineWidth(0.2);
    document.line(12, pageHeight - 10, pageWidth - 12, pageHeight - 10);
    document.setFont("helvetica", "normal");
    document.setFontSize(6.5);
    document.setTextColor(...exportColors.muted);
    document.text(
      `${turnoverPackage.packageNumber} | Rev ${turnoverPackage.revision} | ${turnoverPackage.scopeName}`,
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

export function createTurnoverPackagePdf(
  turnoverPackage: TurnoverPackage,
): jsPDF {
  const document = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  document.setProperties({
    title: `${turnoverPackage.packageNumber} - Turnover Package`,
    subject: `${turnoverPackage.scopeName} commissioning turnover package`,
    author: turnoverPackage.preparedBy,
    creator: "Commissioning Workspace",
  });

  drawCover(document, turnoverPackage);
  drawPackageContents(document, turnoverPackage);
  drawPageFurniture(document, turnoverPackage);
  return document;
}

export async function saveTurnoverPackagePdf({
  turnoverPackage,
}: SaveTurnoverPackageInput): Promise<string | null> {
  const defaultFileName = `${sanitizeFileName(
    turnoverPackage.packageNumber,
  )} - Rev ${sanitizeFileName(turnoverPackage.revision)}${
    turnoverPackage.status === "void" ? " - VOID" : ""
  }.pdf`;
  const path = await save({
    title: "Save turnover package",
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
  const document = createTurnoverPackagePdf(turnoverPackage);
  const arrayBuffer = document.output("arraybuffer");
  const bytes = Array.from(new Uint8Array(arrayBuffer));

  await invoke("save_report_pdf", {
    path: outputPath,
    bytes,
  });

  return outputPath;
}
