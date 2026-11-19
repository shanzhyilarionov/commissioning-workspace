import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { jsPDF } from "jspdf";
import { autoTable, type CellInput } from "jspdf-autotable";
import type { ReportingIdentity } from "../types/reportingIdentity";
import type { CommissioningStage } from "../types/system";
import type {
  TurnoverPackage,
  TurnoverTestRecordSnapshot,
} from "../types/turnover";
import {
  PAGE_MARGIN,
  tableOptions,
  tableEnd,
  ensureVerticalSpace,
  drawTableSection,
  drawPageNumbers,
  drawPdfTitle,
} from "./pdfLayout";

interface SaveTurnoverPackageInput {
  turnoverPackage: TurnoverPackage;
}

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

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value?.trim()) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function packageTitle(turnoverPackage: TurnoverPackage): string {
  return turnoverPackage.packageNumber.trim() || "Turnover Package";
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

function sanitizeFileName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "");

  return (normalized || "turnover-package").slice(0, 120);
}

function drawPackageDetails(
  document: jsPDF,
  turnoverPackage: TurnoverPackage,
): number {
  const { snapshot } = turnoverPackage;
  const identity = packageReportingIdentity(turnoverPackage);
  const pageWidth = document.internal.pageSize.getWidth();
  const availableWidth = pageWidth - PAGE_MARGIN * 2;
  drawPdfTitle(
    document, packageTitle(turnoverPackage), "TURNOVER PACKAGE", identity.organization,
  );

  const fullRow = (label: string, value: string): CellInput[] => [
    label,
    { content: displayText(value), colSpan: 3 },
  ];
  const rows: CellInput[][] = [
    fullRow("Project", `${snapshot.project.name}\nStatus: ${formatLabel(snapshot.project.status)}`),
    fullRow(
      formatLabel(snapshot.scope.kind),
      [snapshot.scope.code, snapshot.scope.name].filter(Boolean).join(" - "),
    ),
    [
      "Revision", displayText(turnoverPackage.revision),
      "Status", turnoverPackage.status.toUpperCase(),
    ],
    fullRow("Issued", formatDateTime(turnoverPackage.generatedAt)),
    fullRow(
      "Stage",
      `${formatStage(turnoverPackage.stageAtGeneration)} | Current blockers: ${turnoverPackage.blockerCount}`,
    ),
  ];

  if (snapshot.project.client.trim()) {
    rows.push(fullRow("Client", snapshot.project.client));
  }
  if (snapshot.project.location.trim()) {
    rows.push(fullRow("Location", snapshot.project.location));
  }
  if (
    snapshot.scope.kind === "subsystem" &&
    (snapshot.scope.parentSystemCode || snapshot.scope.parentSystemName)
  ) {
    rows.push(fullRow(
      "System",
      [snapshot.scope.parentSystemCode, snapshot.scope.parentSystemName]
        .filter(Boolean).join(" - "),
    ));
  }
  if (snapshot.scope.description.trim()) {
    rows.push(fullRow("Scope", snapshot.scope.description));
  }
  if (turnoverPackage.notes.trim()) {
    rows.push(fullRow("Notes", turnoverPackage.notes));
  }
  if (turnoverPackage.status === "void") {
    rows.push(fullRow("Voided", formatDateTime(turnoverPackage.voidedAt)));
    rows.push(fullRow("Reason", turnoverPackage.voidReason));
  }

  const options = tableOptions();
  autoTable(document, {
    ...options,
    startY: tableEnd(document) + 3,
    body: rows,
    columnStyles: {
      0: { ...options.headStyles, cellWidth: 22 },
      1: { cellWidth: availableWidth / 2 - 22 },
      2: { ...options.headStyles, cellWidth: 22 },
      3: { cellWidth: availableWidth / 2 - 22 },
    },
  });

  return tableEnd(document) + 9;
}

function testResult(record: TurnoverTestRecordSnapshot): string {
  if (record.totalItemCount === 0) return "No items";

  const pending = Math.max(
    0,
    record.totalItemCount - record.passedItemCount -
      record.failedItemCount - record.notApplicableItemCount,
  );
  return [
    `${record.totalItemCount} total`,
    record.passedItemCount > 0 ? `${record.passedItemCount} passed` : "",
    record.failedItemCount > 0 ? `${record.failedItemCount} failed` : "",
    pending > 0 ? `${pending} pending` : "",
    record.notApplicableItemCount > 0 ? `${record.notApplicableItemCount} N/A` : "",
  ].filter(Boolean).join("\n");
}

function drawPackageContents(
  document: jsPDF,
  turnoverPackage: TurnoverPackage,
  startY: number,
): void {
  const { snapshot } = turnoverPackage;
  let y = drawTableSection(
    document,
    "Readiness blockers",
    ["Item", "Status", "Detail"],
    snapshot.readiness.blockers.map((blocker) => [
      `${blocker.title}\n${formatLabel(blocker.type)}`,
      formatLabel(blocker.status), blocker.detail,
    ]),
    startY,
    [52, 28, 0],
  );

  const stageRows = snapshot.readiness.stageRecords.map((record) => [
    `${formatStage(record.fromStage)} to ${formatStage(record.toStage)}${record.forced ? "\nFORCED" : ""}`,
    [displayText(record.recordedBy), formatDateTime(record.createdAt)].join("\n"),
    [
      displayText(record.reason),
      `Blockers at transition: ${record.blockerCount}`,
    ].join("\n"),
  ]);
  const missingForcedRecords = turnoverPackage.forcedTransitionCount -
    snapshot.readiness.stageRecords.filter((record) => record.forced).length;
  if (missingForcedRecords > 0) {
    stageRows.push([
      "Forced transitions recorded", "-",
      `${missingForcedRecords} recorded; details unavailable in this snapshot.`,
    ]);
  }
  y = drawTableSection(
    document,
    "Commissioning stage history",
    ["Transition", "Recorded by / Date", "Reason"],
    stageRows,
    y,
    [48, 44, 0],
  );

  const showSubsystem = snapshot.scope.kind === "system" && snapshot.assets.some(
    (asset) => asset.subsystemCode.trim() || asset.subsystemName.trim(),
  );
  y = drawTableSection(
    document,
    "Equipment list",
    ["Tag", "Equipment", "Type", ...(showSubsystem ? ["Subsystem"] : []), "Status"],
    snapshot.assets.map((asset) => [
      displayText(asset.tag), asset.name, displayText(asset.assetType),
      ...(showSubsystem
        ? [displayText(
            [asset.subsystemCode, asset.subsystemName].filter(Boolean).join(" - "),
          )]
        : []),
      formatLabel(asset.status),
    ]),
    y,
    showSubsystem ? [25, 0, 29, 39, 27] : [28, 0, 36, 28],
  );

  y = drawTableSection(
    document,
    "Checklists and functional tests",
    ["Asset", "Checklist / Test", "Result", "Executed", "Sign-off"],
    snapshot.testRecords.map((record) => [
      displayText(record.assetTag),
      [
        record.title,
        record.recordType === "checklist" ? "Checklist" : "Functional test",
        record.completionNotes.trim() ? `Notes: ${record.completionNotes.trim()}` : "",
      ].filter(Boolean).join("\n"),
      testResult(record),
      [
        displayText(record.executedBy), formatDate(record.executionDate),
        record.witnessedBy.trim() ? `Witness: ${record.witnessedBy.trim()}` : "",
      ].filter(Boolean).join("\n"),
      record.signedOffAt
        ? [record.signedOffBy.trim() || "Signed", formatDateTime(record.signedOffAt)].join("\n")
        : ["Unsigned", record.signedOffBy.trim()].filter(Boolean).join("\n"),
    ]),
    y,
    [25, 0, 25, 34, 34],
  );

  y = drawTableSection(
    document,
    "Issues and exceptions",
    ["Asset", "Issue", "Priority", "Status", "Owner / Due"],
    snapshot.issues.map((issue) => [
      displayText(issue.assetTag), issue.title, formatLabel(issue.priority), formatLabel(issue.status),
      [issue.owner.trim(), issue.dueDate ? formatDate(issue.dueDate) : ""]
        .filter(Boolean).join("\n") || "-",
    ]),
    y,
    [25, 0, 22, 27, 34],
  );

  y = drawTableSection(
    document,
    "Document index",
    ["Asset", "Document", "Rev.", "Status"],
    snapshot.documents.map((projectDocument) => [
      projectDocument.assetTag || "Project",
      [
        projectDocument.title,
        formatLabel(projectDocument.category),
        `File: ${displayText(projectDocument.originalFileName)}`,
        projectDocument.requiredForReadiness ? "Required for readiness" : "Supporting document",
      ].join("\n"),
      displayText(projectDocument.revision),
      formatLabel(projectDocument.status),
    ]),
    y,
    [28, 0, 18, 30],
  );

  y = drawTableSection(
    document,
    "Audit trail",
    ["Date / Operator", "Record / Action", "Reason"],
    (snapshot.auditEvents ?? []).map((event) => [
      [formatDateTime(event.createdAt), displayText(event.actor)].join("\n"),
      [
        `${formatLabel(event.entityType)}: ${displayText(event.entityLabel)}`,
        formatLabel(event.action),
      ].join("\n"),
      displayText(event.reason),
    ]),
    y,
    [44, 64, 0],
  );

  const identity = packageReportingIdentity(turnoverPackage);
  autoTable(document, {
    ...tableOptions(),
    startY: ensureVerticalSpace(document, y, 25),
    head: [["Prepared by", "Approved by"]],
    body: [[
      displayText(preparedByWithTitle(turnoverPackage, identity)),
      displayText(turnoverPackage.approvedBy),
    ]],
    columnStyles: {
      0: { cellWidth: (document.internal.pageSize.getWidth() - PAGE_MARGIN * 2) / 2 },
    },
    pageBreak: "avoid",
  });
}

export function createTurnoverPackagePdf(
  turnoverPackage: TurnoverPackage,
): jsPDF {
  const document = new jsPDF({
    orientation: "portrait",
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

  const startY = drawPackageDetails(document, turnoverPackage);
  drawPackageContents(document, turnoverPackage, startY);
  drawPageNumbers(document);
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
