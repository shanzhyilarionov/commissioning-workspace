import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { jsPDF } from "jspdf";
import type { TurnoverPackage } from "../types/turnover";
import { createTurnoverPackagePdf } from "./turnoverExportService";

const turnoverPackage: TurnoverPackage = {
  id: "package-1",
  projectId: "project-1",
  scopeKind: "system",
  scopeId: "system-1",
  scopeCode: "ELEC",
  scopeName: "Electrical Distribution",
  packageNumber: "ELEC-TOP-001",
  revision: "A",
  status: "draft",
  stageAtGeneration: "ready",
  blockerCount: 1,
  forcedTransitionCount: 0,
  preparedBy: "Commissioning Engineer",
  approvedBy: "",
  notes: "Draft package for review.",
  generatedAt: "2026-08-12T12:00:00.000Z",
  voidedAt: null,
  voidReason: "",
  snapshot: {
    schemaVersion: 1,
    generatedAt: "2026-08-12T12:00:00.000Z",
    project: {
      id: "project-1",
      name: "North Plant Commissioning",
      client: "Example Energy",
      location: "Edmonton, Alberta",
      description: "Electrical and mechanical commissioning scope.",
      status: "active",
    },
    scope: {
      kind: "system",
      id: "system-1",
      code: "ELEC",
      name: "Electrical Distribution",
      description: "Medium- and low-voltage distribution equipment.",
      stage: "ready",
      parentSystemCode: "",
      parentSystemName: "",
    },
    readiness: {
      blockers: [
        {
          id: "document-document-1",
          type: "required_document",
          title: "Protection settings report",
          detail: "Required document is for review.",
          status: "for_review",
          destinationPage: "Documents",
          attentionType: "required_document",
          targetId: "document-1",
          matchText: "Protection settings report",
          parentId: null,
          parentTitle: null,
        },
      ],
      stageRecords: [],
    },
    assets: [],
    testRecords: [],
    issues: [],
    documents: [],
  },
};

// Read the serialized page streams so assertions cover the actual exported PDF.
function pdfPageText(document: jsPDF): string[] {
  const pdf = Buffer.from(document.output("arraybuffer")).toString("latin1");
  return Array.from(
    pdf.matchAll(/\/Filter \/FlateDecode[\s\S]*?stream\r?\n([\s\S]*?)\r?\nendstream/g),
    (match) => {
      const stream = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
      return Array.from(stream.matchAll(/\(((?:\\[\s\S]|[^\\)])*)\) Tj/g),
        (text) => text[1].replace(/\\([\\()])/g, "$1"),
      ).join("\n");
    },
  );
}

describe("createTurnoverPackagePdf", () => {
  it("fits a small package on one portrait page without empty sections or dashboard content", () => {
    const document = createTurnoverPackagePdf(turnoverPackage);
    const bytes = new Uint8Array(document.output("arraybuffer"));
    const text = pdfPageText(document).join("\n");

    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
    expect(document.getNumberOfPages()).toBe(1);
    expect(pdfPageText(document)[0].split("\n").slice(0, 2)).toEqual([
      "ELEC-TOP-001", "TURNOVER PACKAGE",
    ]);
    expect(document.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(document.internal.pageSize.getHeight()).toBeCloseTo(297, 0);
    for (const value of [
      "North Plant Commissioning",
      "ELEC-TOP-001",
      "Electrical Distribution",
      "Protection settings report",
      "Prepared by",
      "Approved by",
      "DRAFT",
    ]) {
      expect(text).toContain(value);
    }
    for (const value of [
      "No records captured",
      "READINESS SUMMARY",
      "Project status",
      "Equipment list",
      "Document index",
      "Audit trail",
      "Commissioning stage history",
    ]) {
      expect(text).not.toContain(value);
    }
  });

  it("keeps the void date and reason in the package details", () => {
    const document = createTurnoverPackagePdf({
      ...turnoverPackage,
      status: "void",
      voidedAt: "2026-08-13T13:00:00.000Z",
      voidReason: "Issued with an incorrect revision.",
    });
    const text = pdfPageText(document).join("\n");

    expect(document.getNumberOfPages()).toBe(1);
    expect(text).toContain("VOID");
    expect(text).toContain("2026-08-13 13:00 UTC");
    expect(text).toContain("Issued with an incorrect revision.");
  });

  it("uses the snapshotted organization and preparer's title without product branding", () => {
    const document = createTurnoverPackagePdf({
      ...turnoverPackage,
      preparedBy: "Morgan Lee",
      snapshot: {
        ...turnoverPackage.snapshot,
        schemaVersion: 3,
        reportingIdentity: {
          operatorName: "Morgan Lee",
          organization: "Northline Energy",
          jobTitle: "Lead Engineer",
        },
      },
    });
    const text = pdfPageText(document).join("\n");

    expect(text).toContain("Northline Energy");
    expect(text).toContain("Morgan Lee");
    expect(text).toContain("Lead Engineer");
    expect(text).not.toContain("COMMISSIONING WORKSPACE");
  });

  it("wraps the package title and long original filenames without truncation", () => {
    const packageNumber = `${"North Plant Electrical Handover ".repeat(5)}PACKAGE TITLE END`;
    const originalFileName = `${"electrical-distribution-operation-manual-".repeat(6)}REV-B2.pdf`;
    const document = createTurnoverPackagePdf({
      ...turnoverPackage,
      packageNumber,
      snapshot: {
        ...turnoverPackage.snapshot,
        documents: [{
          id: "long-file", assetTag: "SW-001", title: "Long manual reference",
          category: "manual", revision: "B2", status: "approved",
          requiredForReadiness: true, originalFileName,
        }],
      },
    });
    const pages = pdfPageText(document);
    const text = pages.join("\n");

    expect(pages[0].replace(/\s+/g, " ")).toContain(packageNumber);
    expect(text.replace(/\s/g, "")).toContain(originalFileName);
    expect(text).toContain("Required for readiness");
    expect(text).toContain("Approved by");
  });

  it("retains an explicit warning when a legacy snapshot lacks forced transition details", () => {
    const document = createTurnoverPackagePdf({
      ...turnoverPackage,
      forcedTransitionCount: 2,
    });
    const text = pdfPageText(document).join(" ").replace(/\s+/g, " ");

    expect(text).toContain("Commissioning stage history");
    expect(text).toContain("2 recorded; details unavailable in this snapshot.");
  });

  it("preserves document traceability, stage history, test evidence and audit records", () => {
    const document = createTurnoverPackagePdf({
      ...turnoverPackage,
      forcedTransitionCount: 1,
      snapshot: {
        ...turnoverPackage.snapshot,
        readiness: {
          ...turnoverPackage.snapshot.readiness,
          stageRecords: [{
            id: "stage-1", fromStage: "in_progress", toStage: "ready",
            recordedBy: "Casey Smith", reason: "Temporary supply accepted for testing.",
            forced: true, blockerCount: 1, blockers: [], createdAt: "2026-08-10T12:00:00.000Z",
          }, {
            id: "stage-2", fromStage: "ready", toStage: "commissioned",
            recordedBy: "Casey Smith", reason: "Functional testing accepted.",
            forced: false, blockerCount: 0, blockers: [], createdAt: "2026-08-11T15:30:00.000Z",
          }],
        },
        testRecords: [{
          id: "test-1", assetTag: "SW-001", title: "Protection relay verification",
          recordType: "functional_test", totalItemCount: 6, passedItemCount: 2,
          failedItemCount: 1, notApplicableItemCount: 2, executedBy: "Alex Taylor",
          witnessedBy: "Jordan Park", executionDate: "2026-08-11", signedOffBy: "",
          signedOffAt: null, completionNotes: "Retest required after calibration.",
        }, {
          id: "test-2", assetTag: "SW-002", title: "Switchboard installation",
          recordType: "checklist", totalItemCount: 1, passedItemCount: 1,
          failedItemCount: 0, notApplicableItemCount: 0, executedBy: "Alex Taylor",
          witnessedBy: "", executionDate: "2026-08-11", signedOffBy: "Robin Chen",
          signedOffAt: "2026-08-12T12:00:00.000Z", completionNotes: "",
        }],
        issues: [{
          id: "issue-1", assetTag: "SW-001", title: "Relay calibration required",
          priority: "high", status: "open", owner: "Alex Taylor", dueDate: "2026-08-14",
        }],
        documents: [{
          id: "doc-1", assetTag: "SW-001", title: "Relay operation manual",
          category: "manual", revision: "B2", status: "approved",
          requiredForReadiness: true, originalFileName: "relay-manual-B2.pdf",
        }, {
          id: "doc-2", assetTag: "", title: "Reference drawing",
          category: "drawing", revision: "C", status: "approved",
          requiredForReadiness: false, originalFileName: "reference-drawing-C.pdf",
        }],
        auditEvents: [{
          id: "audit-1", projectId: "project-1", entityType: "asset", entityId: "asset-1",
          parentEntityId: null, action: "updated", entityLabel: "Switchboard 1",
          actor: "Operator", reason: "Routine edit", detailsJson: "{}",
          createdAt: "2026-08-10T12:00:00.000Z",
        }],
      },
    });
    const text = pdfPageText(document).join("\n");

    for (const value of [
      "Temporary supply accepted for testing.",
      "Functional testing accepted.",
      "FORCED",
      "2026-08-11 15:30 UTC",
      "6 total",
      "2 passed",
      "1 failed",
      "1 pending",
      "2 N/A",
      "Unsigned",
      "Robin Chen",
      "2026-08-12 12:00 UTC",
      "Relay calibration required",
      "Aug 14, 2026",
      "Relay operation manual",
      "relay-manual-B2.pdf",
      "Required for readiness",
      "reference-drawing-C.pdf",
      "Supporting document",
      "Witness: Jordan Park",
      "Retest required after calibration.",
      "Audit trail",
      "Asset: Switchboard 1",
      "Routine edit",
      "2026-08-10 12:00 UTC",
      "B2",
      "Approved",
    ]) {
      expect(text.replace(/\s+/g, " ")).toContain(value);
    }
  });

  it("continues long registers with repeated headings and preserves every asset", () => {
    const assets = Array.from({ length: 80 }, (_, index) => ({
      id: `asset-${index}`, tag: `TAG-${String(index).padStart(3, "0")}`,
      name: `Distribution panel ${index}`, assetType: "Switchboard", status: "completed" as const,
      systemCode: "ELEC", systemName: "Electrical Distribution", subsystemCode: "LV",
      subsystemName: "Low voltage",
    }));
    const document = createTurnoverPackagePdf({
      ...turnoverPackage,
      snapshot: { ...turnoverPackage.snapshot, assets },
    });
    const pages = pdfPageText(document);

    expect(pages.length).toBe(document.getNumberOfPages());
    expect(pages.length).toBeGreaterThan(2);
    for (const asset of assets) expect(pages.join("\n")).toContain(asset.tag);
    pages.forEach((page, index) => {
      expect(page).toContain(`Page ${index + 1} of ${pages.length}`);
      if (index > 0) {
        expect(page).not.toContain(turnoverPackage.packageNumber);
        expect(page).not.toContain(turnoverPackage.scopeName);
        expect(page).not.toContain("TURNOVER PACKAGE");
        expect(page).not.toContain("DRAFT");
      }
      if (page.includes("TAG-")) {
        expect(page).toContain("Equipment list");
        expect(page).toContain("Subsystem");
      }
    });
  });

  it("wraps long package notes instead of truncating them", () => {
    const notes = `${"Verify the scope boundary before acceptance. ".repeat(100)}END OF CONDITIONS`;
    const document = createTurnoverPackagePdf({ ...turnoverPackage, notes });
    const text = pdfPageText(document).join("\n");

    expect(text).toContain("END OF CONDITIONS");
    expect(text).toContain("Protection settings report");
    expect(text).toContain("Approved by");
  });

  it("keeps a section heading with its first row when a long issue needs a new page", () => {
    const document = createTurnoverPackagePdf({
      ...turnoverPackage,
      snapshot: {
        ...turnoverPackage.snapshot,
        assets: Array.from({ length: 10 }, (_, index) => ({
          id: `asset-${index}`, tag: `TAG-${index}`, name: "Panel",
          assetType: "Panel", status: "completed",
          systemCode: "ELEC", systemName: "Electrical Distribution",
          subsystemCode: "", subsystemName: "",
        })),
        issues: [{
          id: "long-issue", assetTag: "TAG-0",
          title: `${"Calibration and verification required. ".repeat(24)}END OF ISSUE`,
          priority: "high", status: "open", owner: "Morgan", dueDate: null,
        }],
      },
    });
    const pages = pdfPageText(document);

    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      if (page.includes("Issues and exceptions")) {
        expect(page).toContain("Calibration");
      }
    }
    expect(pages.join(" ").replace(/\s+/g, " ")).toContain("END OF ISSUE");
  });
});
