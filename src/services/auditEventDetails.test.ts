import { describe, expect, it } from "vitest";
import {
  formatAuditDetailValue,
  formatAuditFieldName,
  getAuditEventDetails,
} from "./auditEventDetails";

describe("getAuditEventDetails", () => {
  it("returns only changed before and after fields", () => {
    const details = getAuditEventDetails({
      detailsJson: JSON.stringify({
        before: {
          title: "Pump inspection",
          status: "open",
          priority: "medium",
        },
        after: {
          title: "Pump inspection",
          status: "closed",
          priority: "high",
        },
      }),
    });

    expect(details.changes).toEqual([
      { field: "status", before: "open", after: "closed" },
      { field: "priority", before: "medium", after: "high" },
    ]);
    expect(details.values).toEqual([]);
  });

  it("supports paired before and after properties", () => {
    const details = getAuditEventDetails({
      detailsJson: JSON.stringify({
        beforeStatus: "final",
        afterStatus: "void",
        packageNumber: "TOP-001",
        revision: "A",
      }),
    });

    expect(details.changes).toEqual([
      { field: "status", before: "final", after: "void" },
    ]);
    expect(details.values).toEqual([
      { field: "packageNumber", value: "TOP-001" },
      { field: "revision", value: "A" },
    ]);
  });

  it("treats a one-sided after snapshot as field changes", () => {
    const details = getAuditEventDetails({
      detailsJson: JSON.stringify({
        after: {
          status: "blocked",
        },
      }),
    });

    expect(details.changes).toEqual([
      { field: "status", before: undefined, after: "blocked" },
    ]);
    expect(details.values).toEqual([]);
  });

  it("returns recorded values and hides internal parent identifiers", () => {
    const details = getAuditEventDetails({
      detailsJson: JSON.stringify({
        recordId: "record-1",
        description: "Verify rotation",
        result: "not_applicable",
      }),
    });

    expect(details.changes).toEqual([]);
    expect(details.values).toEqual([
      { field: "description", value: "Verify rotation" },
      { field: "result", value: "not_applicable" },
    ]);
  });

  it("handles invalid details without failing", () => {
    expect(getAuditEventDetails({ detailsJson: "invalid" })).toEqual({
      changes: [],
      values: [],
    });
  });
});

describe("audit detail formatting", () => {
  it("formats field names and values for display", () => {
    expect(formatAuditFieldName("signedOffBy")).toBe("Signed off by");
    expect(formatAuditDetailValue("not_started")).toBe("Not started");
    expect(formatAuditDetailValue("")).toBe("-");
    expect(formatAuditDetailValue(true)).toBe("Yes");
  });
});
