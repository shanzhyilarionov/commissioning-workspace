import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import ActionMenu from "../components/ActionMenu";
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import FixedHeaderTable from "../components/FixedHeaderTable";
import TurnoverPackageModal from "../components/TurnoverPackageModal";
import VoidTurnoverPackageModal from "../components/VoidTurnoverPackageModal";
import {
  getTestRecordReportBundle,
  listCompletedReportRecords,
} from "../repositories/reportRepository";
import {
  createTurnoverPackage,
  deleteDraftTurnoverPackage,
  getTurnoverPackageById,
  listTurnoverPackages,
  voidFinalTurnoverPackage,
} from "../repositories/turnoverRepository";
import {
  listSubsystemsByProject,
  listSystemsByProject,
} from "../repositories/systemRepository";
import type { Project } from "../types/project";
import {
  isAuditNavigationItem,
  type ProjectNavigationItem,
} from "../types/navigation";
import type { ReportRecordSummary } from "../types/report";
import type {
  CommissioningStage,
  CommissioningSystem,
  Subsystem,
} from "../types/system";
import type { TestRecordType } from "../types/testRecord";
import type {
  CreateTurnoverPackageInput,
  TurnoverPackage,
  TurnoverPackageStatus,
  TurnoverPackageSummary,
} from "../types/turnover";
import "./ReportsPage.css";

interface ReportsPageProps {
  currentProject: Project;
  view: ReportsView;
  navigationItem?: ProjectNavigationItem | null;
}

type ReportTypeFilter = "all" | TestRecordType;
type TurnoverStatusFilter = "all" | TurnoverPackageStatus;
type ReportsView = "records" | "turnover";

function formatRecordType(recordType: TestRecordType): string {
  return recordType === "checklist" ? "Checklist" : "Functional test";
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

function formatDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-CA");
}

function formatAsset(record: ReportRecordSummary): string {
  if (!record.assetTag) {
    return "-";
  }

  return record.assetName
    ? `${record.assetTag} - ${record.assetName}`
    : record.assetTag;
}

function formatTurnoverScope(turnoverPackage: TurnoverPackageSummary): string {
  return turnoverPackage.scopeCode
    ? `${turnoverPackage.scopeCode} - ${turnoverPackage.scopeName}`
    : turnoverPackage.scopeName;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return fallback;
}

function ReportsPage({
  currentProject,
  view,
  navigationItem = null,
}: ReportsPageProps) {
  const [records, setRecords] = useState<ReportRecordSummary[]>([]);
  const [turnoverPackages, setTurnoverPackages] = useState<
    TurnoverPackageSummary[]
  >([]);
  const [systems, setSystems] = useState<CommissioningSystem[]>([]);
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [turnoverLoadError, setTurnoverLoadError] = useState<string | null>(
    null,
  );
  const [isRetryingTurnover, setIsRetryingTurnover] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ReportTypeFilter>("all");
  const [turnoverStatusFilter, setTurnoverStatusFilter] =
    useState<TurnoverStatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exportingRecordId, setExportingRecordId] = useState<string | null>(
    null,
  );
  const [exportingPackageId, setExportingPackageId] = useState<string | null>(
    null,
  );
  const [isTurnoverModalOpen, setIsTurnoverModalOpen] = useState(false);
  const [openMenuPackageId, setOpenMenuPackageId] = useState<string | null>(
    null,
  );
  const [packageToDelete, setPackageToDelete] =
    useState<TurnoverPackageSummary | null>(null);
  const [isDeletingPackage, setIsDeletingPackage] = useState(false);
  const [packageDeleteError, setPackageDeleteError] = useState<string | null>(
    null,
  );
  const [packageToVoid, setPackageToVoid] =
    useState<TurnoverPackageSummary | null>(null);
  const [isVoidingPackage, setIsVoidingPackage] = useState(false);
  const [packageVoidError, setPackageVoidError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [savedReportPath, setSavedReportPath] = useState<string | null>(null);

  useEffect(() => {
    if (
      view === "turnover" &&
      navigationItem &&
      isAuditNavigationItem(navigationItem) &&
      navigationItem.entityType === "turnover_package"
    ) {
      setSearchQuery("");
      setTurnoverStatusFilter("all");
    }
  }, [navigationItem, view]);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;

      if (
        target instanceof Element &&
        !target.closest("[data-project-action-menu]")
      ) {
        setOpenMenuPackageId(null);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuPackageId(null);
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setIsLoading(true);
      setLoadError(null);
      setTurnoverLoadError(null);

      if (view === "records") {
        const [recordsResult] = await Promise.allSettled([
          listCompletedReportRecords(currentProject.id),
        ]);

        if (cancelled) {
          return;
        }

        if (recordsResult.status === "fulfilled") {
          setRecords(recordsResult.value);
        } else {
          setLoadError(
            getErrorMessage(
              recordsResult.reason,
              "Failed to load completed report records.",
            ),
          );
        }

        setIsLoading(false);
        return;
      }

      const [packagesResult, systemsResult, subsystemsResult] =
        await Promise.allSettled([
          listTurnoverPackages(currentProject.id),
          listSystemsByProject(currentProject.id),
          listSubsystemsByProject(currentProject.id),
        ]);

      if (cancelled) {
        return;
      }

      const turnoverErrors: string[] = [];

      if (packagesResult.status === "fulfilled") {
        setTurnoverPackages(packagesResult.value);
      } else {
        turnoverErrors.push(
          getErrorMessage(
            packagesResult.reason,
            "Failed to load turnover packages.",
          ),
        );
      }

      if (systemsResult.status === "fulfilled") {
        setSystems(systemsResult.value);
      } else {
        turnoverErrors.push(
          getErrorMessage(systemsResult.reason, "Failed to load systems."),
        );
      }

      if (subsystemsResult.status === "fulfilled") {
        setSubsystems(subsystemsResult.value);
      } else {
        turnoverErrors.push(
          getErrorMessage(
            subsystemsResult.reason,
            "Failed to load subsystems.",
          ),
        );
      }

      setTurnoverLoadError(turnoverErrors[0] ?? null);
      setIsLoading(false);
    }

    setSearchQuery("");
    setTypeFilter("all");
    setTurnoverStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setExportingRecordId(null);
    setExportingPackageId(null);
    setIsTurnoverModalOpen(false);
    setOpenMenuPackageId(null);
    setPackageToDelete(null);
    setIsDeletingPackage(false);
    setPackageDeleteError(null);
    setPackageToVoid(null);
    setIsVoidingPackage(false);
    setPackageVoidError(null);
    setExportError(null);
    setSavedReportPath(null);
    setIsRetryingTurnover(false);
    void loadReports();

    return () => {
      cancelled = true;
    };
  }, [currentProject.id, view]);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return records.filter((record) => {
      const matchesType =
        typeFilter === "all" || record.recordType === typeFilter;
      const matchesFrom = !dateFrom || record.executionDate >= dateFrom;
      const matchesTo = !dateTo || record.executionDate <= dateTo;
      const searchableText = [
        record.title,
        record.description,
        record.assetTag ?? "",
        record.assetName ?? "",
        record.assetSystemName ?? "",
        record.executedBy,
        record.witnessedBy,
        record.signedOffBy,
        formatRecordType(record.recordType),
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch =
        normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);

      return matchesType && matchesFrom && matchesTo && matchesSearch;
    });
  }, [dateFrom, dateTo, records, searchQuery, typeFilter]);

  const filteredTurnoverPackages = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return turnoverPackages.filter((turnoverPackage) => {
      const matchesStatus =
        turnoverStatusFilter === "all" ||
        turnoverPackage.status === turnoverStatusFilter;
      const searchableText = [
        turnoverPackage.packageNumber,
        turnoverPackage.revision,
        turnoverPackage.scopeCode,
        turnoverPackage.scopeName,
        turnoverPackage.preparedBy,
        turnoverPackage.approvedBy,
        turnoverPackage.voidReason,
        formatStage(turnoverPackage.stageAtGeneration),
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch =
        normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);

      return matchesStatus && matchesSearch;
    });
  }, [searchQuery, turnoverPackages, turnoverStatusFilter]);

  async function handleRetryTurnoverData() {
    if (isRetryingTurnover) {
      return;
    }

    setIsRetryingTurnover(true);
    setTurnoverLoadError(null);

    const [packagesResult, systemsResult, subsystemsResult] =
      await Promise.allSettled([
        listTurnoverPackages(currentProject.id),
        listSystemsByProject(currentProject.id),
        listSubsystemsByProject(currentProject.id),
      ]);
    const errors: string[] = [];

    if (packagesResult.status === "fulfilled") {
      setTurnoverPackages(packagesResult.value);
    } else {
      errors.push(
        getErrorMessage(
          packagesResult.reason,
          "Failed to load turnover packages.",
        ),
      );
    }

    if (systemsResult.status === "fulfilled") {
      setSystems(systemsResult.value);
    } else {
      errors.push(
        getErrorMessage(systemsResult.reason, "Failed to load systems."),
      );
    }

    if (subsystemsResult.status === "fulfilled") {
      setSubsystems(subsystemsResult.value);
    } else {
      errors.push(
        getErrorMessage(
          subsystemsResult.reason,
          "Failed to load subsystems.",
        ),
      );
    }

    setTurnoverLoadError(errors[0] ?? null);
    setIsRetryingTurnover(false);
  }

  async function handleGenerateReport(record: ReportRecordSummary) {
    if (exportingRecordId !== null || exportingPackageId !== null) {
      return;
    }

    setExportingRecordId(record.id);
    setExportError(null);
    setSavedReportPath(null);

    try {
      const bundle = await getTestRecordReportBundle(record.id);
      const { saveTestRecordReport } = await import(
        "../services/reportExportService"
      );
      const path = await saveTestRecordReport({
        project: currentProject,
        bundle,
      });

      if (path) {
        setSavedReportPath(path);
      }
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Failed to save the PDF report.",
      );
    } finally {
      setExportingRecordId(null);
    }
  }

  async function saveTurnoverPackage(turnoverPackage: TurnoverPackage) {
    setExportingPackageId(turnoverPackage.id);
    setExportError(null);
    setSavedReportPath(null);

    try {
      const { saveTurnoverPackagePdf } = await import(
        "../services/turnoverExportService"
      );
      const path = await saveTurnoverPackagePdf({ turnoverPackage });

      if (path) {
        setSavedReportPath(path);
      }
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Failed to save the turnover package PDF.",
      );
    } finally {
      setExportingPackageId(null);
    }
  }

  async function handleGenerateTurnoverPackage(
    turnoverPackage: TurnoverPackageSummary,
  ) {
    if (exportingRecordId !== null || exportingPackageId !== null) {
      return;
    }

    setExportingPackageId(turnoverPackage.id);
    setExportError(null);
    setSavedReportPath(null);

    try {
      const storedPackage = await getTurnoverPackageById(turnoverPackage.id);
      const { saveTurnoverPackagePdf } = await import(
        "../services/turnoverExportService"
      );
      const path = await saveTurnoverPackagePdf({
        turnoverPackage: storedPackage,
      });

      if (path) {
        setSavedReportPath(path);
      }
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Failed to save the turnover package PDF.",
      );
    } finally {
      setExportingPackageId(null);
    }
  }

  async function handleCreateTurnoverPackage(
    input: CreateTurnoverPackageInput,
  ) {
    const turnoverPackage = await createTurnoverPackage(
      currentProject.id,
      input,
    );

    setTurnoverPackages((current) => [turnoverPackage, ...current]);
    setIsTurnoverModalOpen(false);
    await saveTurnoverPackage(turnoverPackage);
  }

  function handleRequestDeletePackage(
    turnoverPackage: TurnoverPackageSummary,
  ) {
    setOpenMenuPackageId(null);
    setPackageDeleteError(null);
    setPackageToDelete(turnoverPackage);
  }

  function handleCloseDeletePackage() {
    if (isDeletingPackage) {
      return;
    }

    setPackageToDelete(null);
    setPackageDeleteError(null);
  }

  async function handleConfirmDeletePackage() {
    if (!packageToDelete) {
      return;
    }

    const packageId = packageToDelete.id;
    setIsDeletingPackage(true);
    setPackageDeleteError(null);
    setSavedReportPath(null);

    try {
      await deleteDraftTurnoverPackage(packageId);
      setTurnoverPackages((current) =>
        current.filter((turnoverPackage) => turnoverPackage.id !== packageId),
      );
      setPackageToDelete(null);
    } catch (error) {
      setPackageDeleteError(
        getErrorMessage(error, "Failed to delete the Draft turnover package."),
      );
    } finally {
      setIsDeletingPackage(false);
    }
  }

  function handleRequestVoidPackage(
    turnoverPackage: TurnoverPackageSummary,
  ) {
    setOpenMenuPackageId(null);
    setPackageVoidError(null);
    setPackageToVoid(turnoverPackage);
  }

  function handleCloseVoidPackage() {
    if (isVoidingPackage) {
      return;
    }

    setPackageToVoid(null);
    setPackageVoidError(null);
  }

  async function handleConfirmVoidPackage(reason: string) {
    if (!packageToVoid) {
      return;
    }

    setIsVoidingPackage(true);
    setPackageVoidError(null);
    setSavedReportPath(null);

    try {
      const updatedPackage = await voidFinalTurnoverPackage(
        packageToVoid.id,
        reason,
      );
      setTurnoverPackages((current) =>
        current.map((turnoverPackage) =>
          turnoverPackage.id === updatedPackage.id
            ? updatedPackage
            : turnoverPackage,
        ),
      );
      setPackageToVoid(null);
    } catch (error) {
      setPackageVoidError(
        getErrorMessage(error, "Failed to void the Final turnover package."),
      );
    } finally {
      setIsVoidingPackage(false);
    }
  }

  if (isLoading) {
    return (
      <section className="content-card placeholder">
        <h3>
          {view === "records"
            ? "Loading record reports"
            : "Loading turnover packages"}
        </h3>
        <p>
          {view === "records"
            ? `Reading completed records for ${currentProject.name}.`
            : `Reading turnover package history for ${currentProject.name}.`}
        </p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="content-card placeholder">
        <h3>Unable to load record reports</h3>
        <p>{loadError}</p>
      </section>
    );
  }

  return (
    <>
      <section className="content-card section-card assets-card issues-card reports-card">
        <div className="projects-header reports-header">
          <div>
            <h3>
              {view === "records" ? "Record reports" : "Turnover packages"}
            </h3>
            <p>
              {view === "records"
                ? `Generate signed PDFs from completed checklists and functional tests for ${currentProject.name}.`
                : `Create controlled handover packages from commissioned system and subsystem snapshots for ${currentProject.name}.`}
            </p>
          </div>
        </div>

        {view === "records" ? (
          <div className="assets-toolbar reports-toolbar reports-record-toolbar">
            <input
              className="asset-search-input reports-search-input"
              type="search"
              value={searchQuery}
              placeholder="Search title, asset, system, or signer"
              aria-label="Search completed records"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setSearchQuery(event.target.value)
              }
            />
            <select
              className="asset-status-filter"
              value={typeFilter}
              aria-label="Filter reports by record type"
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setTypeFilter(event.target.value as ReportTypeFilter)
              }
            >
              <option value="all">All types</option>
              <option value="checklist">Checklists</option>
              <option value="functional_test">Functional tests</option>
            </select>
            <label className="reports-date-filter">
              <span>From</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDateFrom(event.target.value)
                }
              />
            </label>
            <label className="reports-date-filter">
              <span>To</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDateTo(event.target.value)
                }
              />
            </label>
            <span className="asset-result-count reports-result-count">
              {filteredRecords.length} of {records.length}
            </span>
          </div>
        ) : (
          <div className="assets-toolbar reports-toolbar turnover-toolbar">
            <input
              className="asset-search-input reports-search-input"
              type="search"
              value={searchQuery}
              placeholder="Search package, scope, revision, or preparer"
              aria-label="Search turnover packages"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setSearchQuery(event.target.value)
              }
            />
            <select
              className="asset-status-filter turnover-status-filter"
              value={turnoverStatusFilter}
              aria-label="Filter turnover packages by status"
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setTurnoverStatusFilter(
                  event.target.value as TurnoverStatusFilter,
                )
              }
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="final">Final</option>
              <option value="void">Void</option>
            </select>
            <button
              className="primary-button toolbar-primary-button turnover-new-button"
              type="button"
              disabled={turnoverLoadError !== null || isRetryingTurnover}
              onClick={() => setIsTurnoverModalOpen(true)}
            >
              New turnover package
            </button>
            <span className="asset-result-count reports-result-count">
              {filteredTurnoverPackages.length} of {turnoverPackages.length}
            </span>
          </div>
        )}

        {exportError && (
          <p className="form-submit-error reports-error" role="alert">
            {exportError}
          </p>
        )}

        {savedReportPath && (
          <div className="reports-save-success" role="status">
            <span>PDF saved successfully.</span>
            <button
              className="row-action-button"
              type="button"
              onClick={() => {
                void revealItemInDir(savedReportPath);
              }}
            >
              Show in folder
            </button>
          </div>
        )}

        {view === "turnover" && turnoverLoadError && (
          <div className="turnover-load-error" role="alert">
            <div>
              <strong>Unable to load turnover packages</strong>
              <span>{turnoverLoadError}</span>
            </div>
            <button
              className="secondary-button"
              type="button"
              disabled={isRetryingTurnover}
              onClick={() => {
                void handleRetryTurnoverData();
              }}
            >
              {isRetryingTurnover ? "Retrying..." : "Try again"}
            </button>
          </div>
        )}

        {view === "records" ? (
          records.length === 0 ? (
            <div className="empty-state reports-empty-state">
              <h3>No completed records</h3>
              <p>
                Complete and sign off a checklist or functional test before
                generating a report.
              </p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="empty-state compact reports-empty-state">
              <h3>No matching reports</h3>
              <p>Change the search text, record type, or execution date range.</p>
            </div>
          ) : (
            <FixedHeaderTable
              className="projects-table reports-table"
              wrapperClassName="issues-table-wrapper reports-table-wrapper"
              ariaLabel="Completed records available for reporting"
              colGroup={
                <colgroup>
                  <col />
                  <col className="reports-type-column-width" />
                  <col />
                  <col className="reports-date-column-width" />
                  <col />
                  <col className="reports-result-column-width" />
                  <col className="reports-action-column-width" />
                </colgroup>
              }
              header={
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Asset</th>
                  <th>Executed</th>
                  <th>Signed off by</th>
                  <th>Result</th>
                  <th aria-label="Report actions" />
                </tr>
              }
              body={
                <>
                  {filteredRecords.map((record) => {
                    const isExporting = exportingRecordId === record.id;
                    const completedWithIssues = record.failedItemCount > 0;

                    return (
                      <tr key={record.id}>
                        <td className="issue-title-cell" title={record.title}>
                          <strong className="issue-title-text">
                            {record.title}
                          </strong>
                        </td>
                        <td>{formatRecordType(record.recordType)}</td>
                        <td
                          className="reports-asset-cell"
                          title={formatAsset(record)}
                        >
                          {record.assetTag ? (
                            <>
                              <strong className="asset-tag">
                                {record.assetTag}
                              </strong>
                              {record.assetName ? ` - ${record.assetName}` : ""}
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="issue-date-cell">
                          {formatDate(record.executionDate)}
                        </td>
                        <td
                          className="reports-signer-cell"
                          title={record.signedOffBy}
                        >
                          {record.signedOffBy}
                        </td>
                        <td className="reports-result-cell">
                          <span
                            className={
                              completedWithIssues
                                ? "reports-result reports-result-with-issues"
                                : "reports-result reports-result-complete"
                            }
                          >
                            {completedWithIssues
                              ? `${record.failedItemCount} linked issue${
                                  record.failedItemCount === 1 ? "" : "s"
                                }`
                              : "Complete"}
                          </span>
                        </td>
                        <td className="table-action-cell reports-action-cell">
                          <button
                            className="row-action-button reports-generate-button"
                            type="button"
                            disabled={
                              exportingRecordId !== null ||
                              exportingPackageId !== null
                            }
                            onClick={() => {
                              void handleGenerateReport(record);
                            }}
                          >
                            {isExporting ? "Preparing..." : "Save PDF"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </>
              }
            />
          )
        ) : turnoverLoadError ? (
          <div className="empty-state reports-empty-state">
            <h3>Turnover packages unavailable</h3>
            <p>Resolve the database error shown above, then try again.</p>
          </div>
        ) : turnoverPackages.length === 0 ? (
          <div className="empty-state reports-empty-state">
            <h3>No turnover packages</h3>
            <p>
              Create a package to preserve a system or subsystem commissioning
              snapshot.
            </p>
          </div>
        ) : filteredTurnoverPackages.length === 0 ? (
          <div className="empty-state compact reports-empty-state">
            <h3>No matching turnover packages</h3>
            <p>Change the search text or package status filter.</p>
          </div>
        ) : (
          <FixedHeaderTable
            className="projects-table turnover-packages-table"
            wrapperClassName="issues-table-wrapper reports-table-wrapper turnover-table-wrapper"
            ariaLabel="Turnover package history"
            header={
              <tr>
                <th>Package</th>
                <th>Revision</th>
                <th>Scope</th>
                <th>Stage</th>
                <th>Status</th>
                <th>Prepared by</th>
                <th>Generated</th>
                <th aria-label="Turnover package actions" />
              </tr>
            }
            body={
              <>
                {filteredTurnoverPackages.map((turnoverPackage) => {
                  const isExporting =
                    exportingPackageId === turnoverPackage.id;

                  return (
                    <tr
                      key={turnoverPackage.id}
                      data-navigation-id={turnoverPackage.id}
                    >
                      <td
                        className="turnover-package-number-cell"
                        title={turnoverPackage.packageNumber}
                      >
                        <strong>{turnoverPackage.packageNumber}</strong>
                      </td>
                      <td className="turnover-revision-cell">
                        {turnoverPackage.revision}
                      </td>
                      <td
                        className="turnover-scope-cell"
                        title={formatTurnoverScope(turnoverPackage)}
                      >
                        {turnoverPackage.scopeCode && (
                          <strong>{turnoverPackage.scopeCode}</strong>
                        )}
                        <span>{turnoverPackage.scopeName}</span>
                      </td>
                      <td className="turnover-stage-cell">
                        <span
                          className={`status-badge ${turnoverPackage.stageAtGeneration}`}
                        >
                          {formatStage(turnoverPackage.stageAtGeneration)}
                        </span>
                      </td>
                      <td className="turnover-status-cell">
                        <span
                          className={`status-badge turnover-package-status ${turnoverPackage.status}`}
                          title={
                            turnoverPackage.status === "void"
                              ? `Voided ${formatDate(
                                  turnoverPackage.voidedAt ?? "",
                                )}: ${turnoverPackage.voidReason}`
                              : undefined
                          }
                        >
                          {turnoverPackage.status === "final"
                            ? "Final"
                            : turnoverPackage.status === "void"
                              ? "Void"
                              : "Draft"}
                        </span>
                      </td>
                      <td
                        className="reports-signer-cell"
                        title={turnoverPackage.preparedBy}
                      >
                        {turnoverPackage.preparedBy}
                      </td>
                      <td className="issue-date-cell">
                        {formatDate(turnoverPackage.generatedAt)}
                      </td>
                      <td className="table-action-cell reports-action-cell">
                        <div className="project-row-actions turnover-row-actions">
                          <button
                            className="row-action-button reports-generate-button"
                            type="button"
                            disabled={
                              exportingRecordId !== null ||
                              exportingPackageId !== null ||
                              isDeletingPackage ||
                              isVoidingPackage
                            }
                            onClick={() => {
                              void handleGenerateTurnoverPackage(
                                turnoverPackage,
                              );
                            }}
                          >
                            {isExporting ? "Preparing..." : "Save PDF"}
                          </button>
                          {turnoverPackage.status !== "void" && (
                            <ActionMenu
                              ariaLabel={`More actions for ${turnoverPackage.packageNumber}`}
                              disabled={isDeletingPackage || isVoidingPackage}
                              isOpen={
                                openMenuPackageId === turnoverPackage.id
                              }
                              onOpenChange={(isOpen) =>
                                setOpenMenuPackageId(
                                  isOpen ? turnoverPackage.id : null,
                                )
                              }
                            >
                              {turnoverPackage.status === "draft" ? (
                                <button
                                  className="project-menu-item danger"
                                  type="button"
                                  role="menuitem"
                                  onClick={() =>
                                    handleRequestDeletePackage(
                                      turnoverPackage,
                                    )
                                  }
                                >
                                  Delete draft
                                </button>
                              ) : (
                                <button
                                  className="project-menu-item danger"
                                  type="button"
                                  role="menuitem"
                                  onClick={() =>
                                    handleRequestVoidPackage(
                                      turnoverPackage,
                                    )
                                  }
                                >
                                  Void package
                                </button>
                              )}
                            </ActionMenu>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </>
            }
          />
        )}
      </section>

      <TurnoverPackageModal
        isOpen={isTurnoverModalOpen}
        projectId={currentProject.id}
        systems={systems}
        subsystems={subsystems}
        onClose={() => setIsTurnoverModalOpen(false)}
        onCreate={handleCreateTurnoverPackage}
      />

      <DeleteConfirmationModal
        isOpen={packageToDelete !== null}
        title="Delete Draft turnover package"
        message={
          packageToDelete ? (
            <>
              Delete <strong>{packageToDelete.packageNumber}</strong>, revision{" "}
              <strong>{packageToDelete.revision}</strong>? Its saved snapshot
              will be permanently removed. This action cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete draft"
        submittingLabel="Deleting draft..."
        isSubmitting={isDeletingPackage}
        error={packageDeleteError}
        onClose={handleCloseDeletePackage}
        onConfirm={() => {
          void handleConfirmDeletePackage();
        }}
      />

      <VoidTurnoverPackageModal
        turnoverPackage={packageToVoid}
        isSubmitting={isVoidingPackage}
        error={packageVoidError}
        onClose={handleCloseVoidPackage}
        onConfirm={handleConfirmVoidPackage}
      />
    </>
  );
}

export default ReportsPage;
