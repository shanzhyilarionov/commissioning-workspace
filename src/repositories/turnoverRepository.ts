import { getStructureReadinessReview } from "./readinessRepository";
import { listAuditEvents } from "./auditRepository";
import { getDatabase } from "../services/database";
import {
  createSuggestedTurnoverPackageNumber,
  getTurnoverFinalEligibility,
} from "../services/turnoverRules";
import type { AssetStatus } from "../types/asset";
import type { DocumentCategory, DocumentStatus } from "../types/document";
import type { IssuePriority, IssueStatus } from "../types/issue";
import type { ProjectStatus } from "../types/project";
import type { ReportingIdentity } from "../types/reportingIdentity";
import type { StructureKind } from "../types/readiness";
import type { CommissioningStage } from "../types/system";
import type { TestRecordType } from "../types/testRecord";
import type {
  CreateTurnoverPackageInput,
  TurnoverAssetSnapshot,
  TurnoverDocumentSnapshot,
  TurnoverIssueSnapshot,
  TurnoverPackage,
  TurnoverPackagePreflight,
  TurnoverPackageSnapshot,
  TurnoverPackageStatus,
  TurnoverPackageSummary,
  TurnoverProjectSnapshot,
  TurnoverScopeSnapshot,
  TurnoverTestRecordSnapshot,
} from "../types/turnover";

interface ProjectRow {
  id: string;
  name: string;
  client: string;
  location: string;
  description: string;
  status: ProjectStatus;
}

interface ScopeRow {
  id: string;
  project_id: string;
  code: string;
  name: string;
  description: string;
  commissioning_stage: CommissioningStage;
  parent_system_code: string;
  parent_system_name: string;
}

interface AssetRow {
  id: string;
  tag: string;
  name: string;
  asset_type: string;
  status: AssetStatus;
  system_code: string | null;
  system_name: string | null;
  subsystem_code: string | null;
  subsystem_name: string | null;
}

interface TestRecordRow {
  id: string;
  asset_tag: string | null;
  title: string;
  record_type: TestRecordType;
  total_item_count: number;
  passed_item_count: number;
  failed_item_count: number;
  not_applicable_item_count: number;
  executed_by: string;
  witnessed_by: string;
  execution_date: string | null;
  signed_off_by: string;
  signed_off_at: string | null;
  completion_notes: string;
}

interface IssueRow {
  id: string;
  asset_tag: string | null;
  title: string;
  priority: IssuePriority;
  status: IssueStatus;
  owner: string;
  due_date: string | null;
}

interface DocumentRow {
  id: string;
  asset_tag: string | null;
  title: string;
  category: DocumentCategory;
  revision: string;
  status: DocumentStatus;
  required_for_readiness: number;
  original_file_name: string;
}

interface TurnoverPackageRow {
  id: string;
  project_id: string;
  scope_kind: StructureKind;
  scope_id: string;
  scope_code: string;
  scope_name: string;
  package_number: string;
  revision: string;
  status: TurnoverPackageStatus;
  stage_at_generation: CommissioningStage;
  blocker_count: number;
  forced_transition_count: number;
  prepared_by: string;
  approved_by: string;
  notes: string;
  snapshot_json: string;
  generated_at: string;
  voided_at: string | null;
  void_reason: string;
}

let turnoverStoragePromise: Promise<void> | null = null;

async function ensureTurnoverStorage(): Promise<void> {
  if (!turnoverStoragePromise) {
    turnoverStoragePromise = (async () => {
      const database = await getDatabase();

      await database.execute(`
        CREATE TABLE IF NOT EXISTS turnover_packages (
          id TEXT PRIMARY KEY NOT NULL,
          project_id TEXT NOT NULL,
          scope_kind TEXT NOT NULL
            CHECK (scope_kind IN ('system', 'subsystem')),
          scope_id TEXT NOT NULL,
          scope_code TEXT NOT NULL DEFAULT '',
          scope_name TEXT NOT NULL,
          package_number TEXT NOT NULL COLLATE NOCASE,
          revision TEXT NOT NULL COLLATE NOCASE,
          status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN ('draft', 'final', 'void')),
          stage_at_generation TEXT NOT NULL
            CHECK (
              stage_at_generation IN (
                'not_started',
                'in_progress',
                'ready',
                'commissioned',
                'handed_over'
              )
            ),
          blocker_count INTEGER NOT NULL DEFAULT 0,
          forced_transition_count INTEGER NOT NULL DEFAULT 0,
          prepared_by TEXT NOT NULL,
          approved_by TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          snapshot_json TEXT NOT NULL,
          generated_at TEXT NOT NULL,
          voided_at TEXT,
          void_reason TEXT NOT NULL DEFAULT '',

          CHECK (
            (
              status = 'void'
              AND voided_at IS NOT NULL
              AND trim(void_reason) <> ''
            )
            OR
            (
              status IN ('draft', 'final')
              AND voided_at IS NULL
              AND trim(void_reason) = ''
            )
          ),

          FOREIGN KEY (project_id)
            REFERENCES projects(id)
            ON DELETE CASCADE,

          UNIQUE (project_id, package_number, revision)
        )
      `);
      await database.execute(`
        CREATE INDEX IF NOT EXISTS
          idx_turnover_packages_project_generated
        ON turnover_packages(project_id, generated_at DESC)
      `);
      await database.execute(`
        CREATE INDEX IF NOT EXISTS
          idx_turnover_packages_scope
        ON turnover_packages(project_id, scope_kind, scope_id)
      `);
    })().catch((error: unknown) => {
      turnoverStoragePromise = null;
      throw error;
    });
  }

  await turnoverStoragePromise;
}

function getScopeColumn(kind: StructureKind): "system_id" | "subsystem_id" {
  return kind === "system" ? "system_id" : "subsystem_id";
}

function mapProjectRow(row: ProjectRow): TurnoverProjectSnapshot {
  return {
    id: row.id,
    name: row.name,
    client: row.client,
    location: row.location,
    description: row.description,
    status: row.status,
  };
}

function mapScopeRow(
  kind: StructureKind,
  row: ScopeRow,
): TurnoverScopeSnapshot {
  return {
    kind,
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    stage: row.commissioning_stage,
    parentSystemCode: row.parent_system_code,
    parentSystemName: row.parent_system_name,
  };
}

function mapPackageSummary(row: TurnoverPackageRow): TurnoverPackageSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    scopeKind: row.scope_kind,
    scopeId: row.scope_id,
    scopeCode: row.scope_code,
    scopeName: row.scope_name,
    packageNumber: row.package_number,
    revision: row.revision,
    status: row.status,
    stageAtGeneration: row.stage_at_generation,
    blockerCount: Number(row.blocker_count),
    forcedTransitionCount: Number(row.forced_transition_count),
    preparedBy: row.prepared_by,
    approvedBy: row.approved_by,
    notes: row.notes,
    generatedAt: row.generated_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
  };
}

function parseSnapshot(value: string): TurnoverPackageSnapshot {
  try {
    const parsed = JSON.parse(value) as Partial<TurnoverPackageSnapshot>;
    const reportingIdentity = parsed.reportingIdentity;

    if (
      (parsed.schemaVersion !== 1 &&
        parsed.schemaVersion !== 2 &&
        parsed.schemaVersion !== 3) ||
      !parsed.project ||
      !parsed.scope ||
      !parsed.readiness ||
      !Array.isArray(parsed.assets) ||
      !Array.isArray(parsed.testRecords) ||
      !Array.isArray(parsed.issues) ||
      !Array.isArray(parsed.documents) ||
      (parsed.schemaVersion !== 1 && !Array.isArray(parsed.auditEvents)) ||
      (parsed.schemaVersion === 3 &&
        (!reportingIdentity ||
          typeof reportingIdentity.operatorName !== "string" ||
          typeof reportingIdentity.organization !== "string" ||
          typeof reportingIdentity.jobTitle !== "string"))
    ) {
      throw new Error();
    }

    return parsed as TurnoverPackageSnapshot;
  } catch {
    throw new Error("The turnover package snapshot is invalid.");
  }
}

async function getProject(projectId: string): Promise<TurnoverProjectSnapshot> {
  const database = await getDatabase();
  const rows = await database.select<ProjectRow[]>(
    `
      SELECT id, name, client, location, description, status
      FROM projects
      WHERE id = $1
      LIMIT 1
    `,
    [projectId],
  );

  if (!rows[0]) {
    throw new Error("Project not found.");
  }

  return mapProjectRow(rows[0]);
}

async function getScope(
  projectId: string,
  kind: StructureKind,
  scopeId: string,
): Promise<TurnoverScopeSnapshot> {
  const database = await getDatabase();
  const rows = await database.select<ScopeRow[]>(
    kind === "system"
      ? `
          SELECT
            systems.id,
            systems.project_id,
            systems.code,
            systems.name,
            systems.description,
            systems.commissioning_stage,
            '' AS parent_system_code,
            '' AS parent_system_name
          FROM systems
          WHERE systems.id = $1
            AND systems.project_id = $2
          LIMIT 1
        `
      : `
          SELECT
            subsystems.id,
            systems.project_id,
            subsystems.code,
            subsystems.name,
            subsystems.description,
            subsystems.commissioning_stage,
            systems.code AS parent_system_code,
            systems.name AS parent_system_name
          FROM subsystems
          INNER JOIN systems
            ON systems.id = subsystems.system_id
          WHERE subsystems.id = $1
            AND systems.project_id = $2
          LIMIT 1
        `,
    [scopeId, projectId],
  );

  if (!rows[0]) {
    throw new Error(
      `${kind === "system" ? "System" : "Subsystem"} not found in this project.`,
    );
  }

  return mapScopeRow(kind, rows[0]);
}

async function listScopeAssets(
  kind: StructureKind,
  scopeId: string,
): Promise<TurnoverAssetSnapshot[]> {
  const database = await getDatabase();
  const column = getScopeColumn(kind);
  const rows = await database.select<AssetRow[]>(
    `
      SELECT
        assets.id,
        assets.tag,
        assets.name,
        assets.asset_type,
        assets.status,
        systems.code AS system_code,
        COALESCE(systems.name, assets.system_name) AS system_name,
        subsystems.code AS subsystem_code,
        subsystems.name AS subsystem_name
      FROM assets
      LEFT JOIN systems
        ON systems.id = assets.system_id
      LEFT JOIN subsystems
        ON subsystems.id = assets.subsystem_id
      WHERE assets.${column} = $1
      ORDER BY assets.tag COLLATE NOCASE
    `,
    [scopeId],
  );

  return rows.map((row) => ({
    id: row.id,
    tag: row.tag,
    name: row.name,
    assetType: row.asset_type,
    status: row.status,
    systemCode: row.system_code ?? "",
    systemName: row.system_name ?? "",
    subsystemCode: row.subsystem_code ?? "",
    subsystemName: row.subsystem_name ?? "",
  }));
}

async function listScopeTestRecords(
  kind: StructureKind,
  scopeId: string,
): Promise<TurnoverTestRecordSnapshot[]> {
  const database = await getDatabase();
  const column = getScopeColumn(kind);
  const rows = await database.select<TestRecordRow[]>(
    `
      SELECT
        test_records.id,
        assets.tag AS asset_tag,
        test_records.title,
        test_records.record_type,
        (
          SELECT COUNT(*)
          FROM test_items
          WHERE test_items.test_record_id = test_records.id
        ) AS total_item_count,
        (
          SELECT COUNT(*)
          FROM test_items
          WHERE test_items.test_record_id = test_records.id
            AND test_items.result = 'pass'
        ) AS passed_item_count,
        (
          SELECT COUNT(*)
          FROM test_items
          WHERE test_items.test_record_id = test_records.id
            AND test_items.result = 'fail'
        ) AS failed_item_count,
        (
          SELECT COUNT(*)
          FROM test_items
          WHERE test_items.test_record_id = test_records.id
            AND test_items.result = 'not_applicable'
        ) AS not_applicable_item_count,
        test_records.executed_by,
        test_records.witnessed_by,
        test_records.execution_date,
        test_records.signed_off_by,
        test_records.signed_off_at,
        test_records.completion_notes
      FROM test_records
      INNER JOIN assets
        ON assets.id = test_records.asset_id
      WHERE assets.${column} = $1
      ORDER BY
        test_records.execution_date DESC,
        test_records.title COLLATE NOCASE
    `,
    [scopeId],
  );

  return rows.map((row) => ({
    id: row.id,
    assetTag: row.asset_tag ?? "",
    title: row.title,
    recordType: row.record_type,
    totalItemCount: Number(row.total_item_count),
    passedItemCount: Number(row.passed_item_count),
    failedItemCount: Number(row.failed_item_count),
    notApplicableItemCount: Number(row.not_applicable_item_count),
    executedBy: row.executed_by,
    witnessedBy: row.witnessed_by,
    executionDate: row.execution_date,
    signedOffBy: row.signed_off_by,
    signedOffAt: row.signed_off_at,
    completionNotes: row.completion_notes,
  }));
}

async function listScopeIssues(
  kind: StructureKind,
  scopeId: string,
): Promise<TurnoverIssueSnapshot[]> {
  const database = await getDatabase();
  const column = getScopeColumn(kind);
  const rows = await database.select<IssueRow[]>(
    `
      SELECT
        issues.id,
        assets.tag AS asset_tag,
        issues.title,
        issues.priority,
        issues.status,
        issues.owner,
        issues.due_date
      FROM issues
      INNER JOIN assets
        ON assets.id = issues.asset_id
      WHERE assets.${column} = $1
      ORDER BY
        CASE issues.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        issues.updated_at DESC
    `,
    [scopeId],
  );

  return rows.map((row) => ({
    id: row.id,
    assetTag: row.asset_tag ?? "",
    title: row.title,
    priority: row.priority,
    status: row.status,
    owner: row.owner,
    dueDate: row.due_date,
  }));
}

async function listScopeDocuments(
  projectId: string,
  kind: StructureKind,
  scopeId: string,
): Promise<TurnoverDocumentSnapshot[]> {
  const database = await getDatabase();
  const column = getScopeColumn(kind);
  const rows = await database.select<DocumentRow[]>(
    `
      SELECT
        project_documents.id,
        assets.tag AS asset_tag,
        project_documents.title,
        project_documents.category,
        project_documents.revision,
        project_documents.status,
        project_documents.required_for_readiness,
        project_documents.original_file_name
      FROM project_documents
      LEFT JOIN assets
        ON assets.id = project_documents.asset_id
      WHERE project_documents.project_id = $1
        AND (
          project_documents.asset_id IS NULL
          OR assets.${column} = $2
        )
      ORDER BY
        project_documents.required_for_readiness DESC,
        project_documents.title COLLATE NOCASE
    `,
    [projectId, scopeId],
  );

  return rows.map((row) => ({
    id: row.id,
    assetTag: row.asset_tag ?? "",
    title: row.title,
    category: row.category,
    revision: row.revision,
    status: row.status,
    requiredForReadiness: row.required_for_readiness === 1,
    originalFileName: row.original_file_name,
  }));
}

async function getExistingScopePackageCount(
  projectId: string,
  kind: StructureKind,
  scopeId: string,
): Promise<number> {
  await ensureTurnoverStorage();
  const database = await getDatabase();
  const rows = await database.select<{ package_count: number }[]>(
    `
      SELECT COUNT(*) AS package_count
      FROM turnover_packages
      WHERE project_id = $1
        AND scope_kind = $2
        AND scope_id = $3
    `,
    [projectId, kind, scopeId],
  );

  return Number(rows[0]?.package_count ?? 0);
}

function getScopeReference(scope: TurnoverScopeSnapshot): string {
  if (scope.kind === "subsystem") {
    return (
      [scope.parentSystemCode, scope.code]
        .filter((value) => value.trim().length > 0)
        .join("-") || scope.name
    );
  }

  return scope.code || scope.name;
}

export async function listTurnoverPackages(
  projectId: string,
): Promise<TurnoverPackageSummary[]> {
  await ensureTurnoverStorage();
  const database = await getDatabase();
  const rows = await database.select<TurnoverPackageRow[]>(
    `
      SELECT
        id,
        project_id,
        scope_kind,
        scope_id,
        scope_code,
        scope_name,
        package_number,
        revision,
        status,
        stage_at_generation,
        blocker_count,
        forced_transition_count,
        prepared_by,
        approved_by,
        notes,
        snapshot_json,
        generated_at,
        voided_at,
        void_reason
      FROM turnover_packages
      WHERE project_id = $1
      ORDER BY generated_at DESC, package_number COLLATE NOCASE
    `,
    [projectId],
  );

  return rows.map(mapPackageSummary);
}

export async function getTurnoverPackageById(
  packageId: string,
): Promise<TurnoverPackage> {
  await ensureTurnoverStorage();
  const database = await getDatabase();
  const rows = await database.select<TurnoverPackageRow[]>(
    `
      SELECT
        id,
        project_id,
        scope_kind,
        scope_id,
        scope_code,
        scope_name,
        package_number,
        revision,
        status,
        stage_at_generation,
        blocker_count,
        forced_transition_count,
        prepared_by,
        approved_by,
        notes,
        snapshot_json,
        generated_at,
        voided_at,
        void_reason
      FROM turnover_packages
      WHERE id = $1
      LIMIT 1
    `,
    [packageId],
  );

  if (!rows[0]) {
    throw new Error("Turnover package not found.");
  }

  return {
    ...mapPackageSummary(rows[0]),
    snapshot: parseSnapshot(rows[0].snapshot_json),
  };
}

export async function getTurnoverPackagePreflight(
  projectId: string,
  kind: StructureKind,
  scopeId: string,
): Promise<TurnoverPackagePreflight> {
  const scope = await getScope(projectId, kind, scopeId);
  const [review, assets, testRecords, issues, documents, packageCount] =
    await Promise.all([
      getStructureReadinessReview(kind, scopeId),
      listScopeAssets(kind, scopeId),
      listScopeTestRecords(kind, scopeId),
      listScopeIssues(kind, scopeId),
      listScopeDocuments(projectId, kind, scopeId),
      getExistingScopePackageCount(projectId, kind, scopeId),
    ]);
  const eligibility = getTurnoverFinalEligibility(
    review.stage,
    review.blockers.length,
  );
  const currentScope = {
    ...scope,
    stage: review.stage,
  };

  return {
    scope: currentScope,
    blockerCount: review.blockers.length,
    forcedTransitionCount: review.records.filter((record) => record.forced)
      .length,
    assetCount: assets.length,
    testRecordCount: testRecords.length,
    issueCount: issues.length,
    documentCount: documents.length,
    eligibleForFinal: eligibility.eligible,
    finalEligibilityReason: eligibility.reason,
    suggestedPackageNumber: createSuggestedTurnoverPackageNumber(
      getScopeReference(currentScope),
      packageCount + 1,
    ),
  };
}

export async function createTurnoverPackage(
  projectId: string,
  input: CreateTurnoverPackageInput,
  reportingIdentity: ReportingIdentity,
): Promise<TurnoverPackage> {
  await ensureTurnoverStorage();
  const packageNumber = input.packageNumber.trim().toUpperCase();
  const revision = input.revision.trim().toUpperCase();
  const preparedBy = input.preparedBy.trim();
  const approvedBy = input.approvedBy.trim();
  const notes = input.notes.trim();
  const identitySnapshot: ReportingIdentity = {
    operatorName: reportingIdentity.operatorName.trim(),
    organization: reportingIdentity.organization.trim(),
    jobTitle: reportingIdentity.jobTitle.trim(),
  };

  if (!packageNumber) {
    throw new Error("Package number is required.");
  }

  if (!revision) {
    throw new Error("Revision is required.");
  }

  if (!preparedBy) {
    throw new Error("Prepared by is required.");
  }

  if (input.status === "final" && !approvedBy) {
    throw new Error("Approved by is required for a final package.");
  }

  if (input.status !== "draft" && input.status !== "final") {
    throw new Error("A new turnover package must be Draft or Final.");
  }

  const [project, scope] = await Promise.all([
    getProject(projectId),
    getScope(projectId, input.scopeKind, input.scopeId),
  ]);
  const [review, assets, testRecords, issues, documents, auditEvents] =
    await Promise.all([
      getStructureReadinessReview(input.scopeKind, input.scopeId),
      listScopeAssets(input.scopeKind, input.scopeId),
      listScopeTestRecords(input.scopeKind, input.scopeId),
      listScopeIssues(input.scopeKind, input.scopeId),
      listScopeDocuments(projectId, input.scopeKind, input.scopeId),
      listAuditEvents(projectId, 500),
    ]);
  const eligibility = getTurnoverFinalEligibility(
    review.stage,
    review.blockers.length,
  );

  if (input.status === "final" && !eligibility.eligible) {
    throw new Error(
      eligibility.reason ?? "This scope is not eligible for a final package.",
    );
  }

  const database = await getDatabase();
  const duplicateRows = await database.select<{ id: string }[]>(
    `
      SELECT id
      FROM turnover_packages
      WHERE project_id = $1
        AND package_number = $2 COLLATE NOCASE
        AND revision = $3 COLLATE NOCASE
      LIMIT 1
    `,
    [projectId, packageNumber, revision],
  );

  if (duplicateRows.length > 0) {
    throw new Error("This package number and revision already exist.");
  }

  const generatedAt = new Date().toISOString();
  const forcedTransitionCount = review.records.filter(
    (record) => record.forced,
  ).length;
  const currentScope: TurnoverScopeSnapshot = {
    ...scope,
    stage: review.stage,
  };
  const snapshot: TurnoverPackageSnapshot = {
    schemaVersion: 3,
    generatedAt,
    reportingIdentity: identitySnapshot,
    project,
    scope: currentScope,
    readiness: {
      blockers: review.blockers,
      stageRecords: review.records,
    },
    assets,
    testRecords,
    issues,
    documents,
    auditEvents,
  };
  const turnoverPackage: TurnoverPackage = {
    id: crypto.randomUUID(),
    projectId,
    scopeKind: input.scopeKind,
    scopeId: input.scopeId,
    scopeCode: currentScope.code,
    scopeName: currentScope.name,
    packageNumber,
    revision,
    status: input.status,
    stageAtGeneration: currentScope.stage,
    blockerCount: review.blockers.length,
    forcedTransitionCount,
    preparedBy,
    approvedBy,
    notes,
    generatedAt,
    voidedAt: null,
    voidReason: "",
    snapshot,
  };

  await database.execute(
    `
      INSERT INTO turnover_packages (
        id,
        project_id,
        scope_kind,
        scope_id,
        scope_code,
        scope_name,
        package_number,
        revision,
        status,
        stage_at_generation,
        blocker_count,
        forced_transition_count,
        prepared_by,
        approved_by,
        notes,
        snapshot_json,
        generated_at,
        voided_at,
        void_reason
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19
      )
    `,
    [
      turnoverPackage.id,
      turnoverPackage.projectId,
      turnoverPackage.scopeKind,
      turnoverPackage.scopeId,
      turnoverPackage.scopeCode,
      turnoverPackage.scopeName,
      turnoverPackage.packageNumber,
      turnoverPackage.revision,
      turnoverPackage.status,
      turnoverPackage.stageAtGeneration,
      turnoverPackage.blockerCount,
      turnoverPackage.forcedTransitionCount,
      turnoverPackage.preparedBy,
      turnoverPackage.approvedBy,
      turnoverPackage.notes,
      JSON.stringify(turnoverPackage.snapshot),
      turnoverPackage.generatedAt,
      turnoverPackage.voidedAt,
      turnoverPackage.voidReason,
    ],
  );

  return turnoverPackage;
}

export async function deleteDraftTurnoverPackage(
  packageId: string,
): Promise<void> {
  const turnoverPackage = await getTurnoverPackageById(packageId);

  if (turnoverPackage.status !== "draft") {
    throw new Error("Only Draft turnover packages can be deleted.");
  }

  const database = await getDatabase();
  const result = await database.execute(
    `
      DELETE FROM turnover_packages
      WHERE id = $1
        AND status = 'draft'
    `,
    [packageId],
  );

  if (result.rowsAffected !== 1) {
    throw new Error("The Draft turnover package could not be deleted.");
  }
}

export async function voidFinalTurnoverPackage(
  packageId: string,
  reason: string,
): Promise<TurnoverPackage> {
  const normalizedReason = reason.trim();

  if (!normalizedReason) {
    throw new Error("A void reason is required.");
  }

  const turnoverPackage = await getTurnoverPackageById(packageId);

  if (turnoverPackage.status !== "final") {
    throw new Error("Only Final turnover packages can be voided.");
  }

  const database = await getDatabase();
  const voidedAt = new Date().toISOString();
  const result = await database.execute(
    `
      UPDATE turnover_packages
      SET
        status = 'void',
        voided_at = $1,
        void_reason = $2
      WHERE id = $3
        AND status = 'final'
    `,
    [voidedAt, normalizedReason, packageId],
  );

  if (result.rowsAffected !== 1) {
    throw new Error("The Final turnover package could not be voided.");
  }

  return getTurnoverPackageById(packageId);
}
