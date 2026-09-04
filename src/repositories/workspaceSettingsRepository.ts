import { getDatabase } from "../services/database";
import type { ReportingIdentity } from "../types/reportingIdentity";

interface SettingRow {
  key: string;
  value: string;
}

export const EMPTY_REPORTING_IDENTITY: ReportingIdentity = {
  operatorName: "",
  organization: "",
  jobTitle: "",
};

function normalizeReportingIdentity(
  identity: ReportingIdentity,
): ReportingIdentity {
  return {
    operatorName: identity.operatorName.trim(),
    organization: identity.organization.trim(),
    jobTitle: identity.jobTitle.trim(),
  };
}

export async function getReportingIdentity(): Promise<ReportingIdentity> {
  const database = await getDatabase();
  const rows = await database.select<SettingRow[]>(
    `
      SELECT key, value
      FROM workspace_settings
      WHERE key IN (
        'current_operator',
        'reporting_organization',
        'reporting_job_title'
      )
    `,
  );
  const values = new Map(rows.map((row) => [row.key, row.value]));

  return {
    operatorName: values.get("current_operator") ?? "",
    organization: values.get("reporting_organization") ?? "",
    jobTitle: values.get("reporting_job_title") ?? "",
  };
}

export async function saveReportingIdentity(
  identity: ReportingIdentity,
): Promise<ReportingIdentity> {
  const normalized = normalizeReportingIdentity(identity);
  const database = await getDatabase();
  const updatedAt = new Date().toISOString();

  await database.execute(
    `
      INSERT INTO workspace_settings (key, value, updated_at)
      VALUES
        ('current_operator', $1, $4),
        ('reporting_organization', $2, $4),
        ('reporting_job_title', $3, $4)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
    [
      normalized.operatorName,
      normalized.organization,
      normalized.jobTitle,
      updatedAt,
    ],
  );

  return normalized;
}
