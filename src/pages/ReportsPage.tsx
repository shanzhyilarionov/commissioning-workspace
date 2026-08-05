import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import FixedHeaderTable from "../components/FixedHeaderTable";
import {
  getTestRecordReportBundle,
  listCompletedReportRecords,
} from "../repositories/reportRepository";
import { saveTestRecordReport } from "../services/reportExportService";
import type { Project } from "../types/project";
import type { ReportRecordSummary } from "../types/report";
import type { TestRecordType } from "../types/testRecord";
import "./ReportsPage.css";

interface ReportsPageProps {
  currentProject: Project;
}

type ReportTypeFilter = "all" | TestRecordType;

function formatRecordType(recordType: TestRecordType): string {
  return recordType === "checklist" ? "Checklist" : "Functional test";
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
    return "—";
  }

  return record.assetName
    ? `${record.assetTag} — ${record.assetName}`
    : record.assetTag;
}

function ReportsPage({ currentProject }: ReportsPageProps) {
  const [records, setRecords] = useState<ReportRecordSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ReportTypeFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exportingRecordId, setExportingRecordId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [savedReportPath, setSavedReportPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const storedRecords = await listCompletedReportRecords(currentProject.id);

        if (!cancelled) {
          setRecords(storedRecords);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load completed records.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    setSearchQuery("");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setExportingRecordId(null);
    setExportError(null);
    setSavedReportPath(null);
    void loadReports();

    return () => {
      cancelled = true;
    };
  }, [currentProject.id]);

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

  async function handleGenerateReport(record: ReportRecordSummary) {
    if (exportingRecordId !== null) {
      return;
    }

    setExportingRecordId(record.id);
    setExportError(null);
    setSavedReportPath(null);

    try {
      const bundle = await getTestRecordReportBundle(record.id);
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

  if (isLoading) {
    return (
      <section className="content-card placeholder">
        <h3>Loading reports</h3>
        <p>Reading completed records for {currentProject.name}.</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="content-card placeholder">
        <h3>Unable to load reports</h3>
        <p>{loadError}</p>
      </section>
    );
  }

  return (
    <section className="content-card section-card assets-card issues-card reports-card">
      <div className="projects-header reports-header">
        <div>
          <h3>Reports</h3>
          <p>
            Generate signed checklist and functional test reports for{" "}
            {currentProject.name}.
          </p>
        </div>
      </div>

      <div className="assets-toolbar reports-toolbar">
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

      {exportError && (
        <p className="form-submit-error reports-error" role="alert">
          {exportError}
        </p>
      )}

      {savedReportPath && (
        <div className="reports-save-success" role="status">
          <span>PDF report saved successfully.</span>
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

      {records.length === 0 ? (
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
                    <td className="reports-asset-cell" title={formatAsset(record)}>
                      {record.assetTag ? (
                        <>
                          <strong className="asset-tag">{record.assetTag}</strong>
                          {record.assetName ? ` — ${record.assetName}` : ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="issue-date-cell">
                      {formatDate(record.executionDate)}
                    </td>
                    <td className="reports-signer-cell" title={record.signedOffBy}>
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
                        disabled={exportingRecordId !== null}
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
      )}
    </section>
  );
}

export default ReportsPage;
