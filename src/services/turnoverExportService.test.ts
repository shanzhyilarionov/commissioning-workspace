import { describe, expect, it } from "vitest";
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

describe("createTurnoverPackagePdf", () => {
  it("creates a multi-page PDF document from a package snapshot", () => {
    const document = createTurnoverPackagePdf(turnoverPackage);
    const bytes = new Uint8Array(document.output("arraybuffer"));
    const signature = String.fromCharCode(...bytes.slice(0, 4));

    expect(document.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect(signature).toBe("%PDF");
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it("creates a PDF for a voided package with lifecycle details", () => {
    const document = createTurnoverPackagePdf({
      ...turnoverPackage,
      status: "void",
      voidedAt: "2026-08-12T13:00:00.000Z",
      voidReason: "Issued with an incorrect revision.",
    });
    const bytes = new Uint8Array(document.output("arraybuffer"));

    expect(document.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it("creates a PDF with a snapshotted reporting identity", () => {
    const document = createTurnoverPackagePdf({
      ...turnoverPackage,
      preparedBy: "Morgan Lee",
      snapshot: {
        ...turnoverPackage.snapshot,
        schemaVersion: 3,
        reportingIdentity: {
          operatorName: "Morgan Lee",
          organization: "Northline Energy",
          jobTitle: "Commissioning Engineer",
        },
      },
    });
    const bytes = new Uint8Array(document.output("arraybuffer"));

    expect(document.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });
});
