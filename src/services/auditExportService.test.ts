import { describe, expect, it } from "vitest";
import type { AuditEvent } from "../types/audit";
import { createAuditHistoryCsv } from "./auditExportService";

const auditEvent: AuditEvent = {
  id: "event-1",
  projectId: "project-1",
  entityType: "issue",
  entityId: "issue-1",
  parentEntityId: null,
  action: "status_changed",
  entityLabel: "Pump seal, north train",
  actor: "=UNSAFE()",
  reason: "Verified by \"Morgan\"\nafter the retest.",
  detailsJson: JSON.stringify({
    before: {
      status: "open",
      priority: "medium",
    },
    after: {
      status: "closed",
      priority: "medium",
    },
    reviewRequired: true,
  }),
  createdAt: "2026-08-17T20:30:00.000Z",
};

describe("createAuditHistoryCsv", () => {
  it("exports traceable audit fields and formatted details", () => {
    const csv = createAuditHistoryCsv("North Plant", [auditEvent]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Project","Timestamp (UTC)","Operator"');
    expect(csv).toContain('"North Plant","2026-08-17T20:30:00.000Z"');
    expect(csv).toContain('"Status Changed","Issue"');
    expect(csv).toContain('"Status: open -> closed"');
    expect(csv).toContain('"Review required: Yes"');
    expect(csv).toContain('"issue-1","","event-1"');
  });

  it("escapes CSV content and protects spreadsheet formulas", () => {
    const csv = createAuditHistoryCsv("North Plant", [auditEvent]);

    expect(csv).toContain('"\'=UNSAFE()"');
    expect(csv).toContain(
      '"Verified by ""Morgan""\nafter the retest."',
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
