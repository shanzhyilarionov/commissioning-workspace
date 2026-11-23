import { describe, expect, it } from "vitest";
import { getAuditDestinationPage } from "./navigation";

describe("audit navigation", () => {
  it.each(["system", "subsystem"] as const)(
    "opens %s records in the Systems module",
    (entityType) => {
      expect(getAuditDestinationPage(entityType)).toBe("Systems");
    },
  );

  it.each([
    ["asset", "Assets"],
    ["test_record", "Checklists & Tests"],
    ["test_item", "Checklists & Tests"],
    ["issue", "Issues"],
    ["document", "Documents"],
    ["turnover_package", "Turnover packages"],
    ["project", null],
  ] as const)("keeps the destination for %s records", (entityType, page) => {
    expect(getAuditDestinationPage(entityType)).toBe(page);
  });
});
