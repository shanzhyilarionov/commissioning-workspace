import { useEffect, useState, type ReactNode } from "react";
import ClickableTableRow from "../components/ClickableTableRow";
import FilterSelect from "../components/FilterSelect";
import FixedHeaderTable from "../components/FixedHeaderTable";
import ListToolbar from "../components/ListToolbar";
import TablePage from "../components/TablePage";
import { listWorkspaceMetricEntries } from "../repositories/workspaceMetricRepository";
import {
  getWorkspaceMetricFilterOptions,
  matchesWorkspaceMetricFilter,
  workspaceMetricFilters,
} from "../services/workspaceMetricFilters";
import {
  workspaceMetricLabels,
  type WorkspaceMetricEntry,
  type WorkspaceMetricKind,
} from "../types/workspaceMetric";

interface WorkspaceMetricPageProps {
  kind: WorkspaceMetricKind;
  onBack: () => void;
  onOpenEntry: (entry: WorkspaceMetricEntry) => void;
}

const descriptions: Record<WorkspaceMetricKind, string> = {
  assets: "Every asset across your workspace, including archived projects.",
  test_results:
    "Every passed or failed test item across your workspace, including archived projects.",
  active_issues:
    "Open and in-progress issues across your workspace, including archived projects.",
  attention_projects:
    "Active projects with critical or overdue issues, failed test items, or blocked assets.",
};

const searchPlaceholders: Record<WorkspaceMetricKind, string> = {
  assets: "Search assets, projects, or systems...",
  test_results: "Search test items, projects, or records...",
  active_issues: "Search issues or projects...",
  attention_projects: "Search projects...",
};

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) {
    return "-";
  }

  const date = new Date(`${dueDate}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? dueDate
    : date.toLocaleDateString("en-CA");
}

function getSearchValues(entry: WorkspaceMetricEntry): string[] {
  switch (entry.kind) {
    case "assets":
      return [
        entry.tag,
        entry.name,
        entry.projectName,
        entry.system,
        formatLabel(entry.status),
      ];
    case "test_results":
      return [
        entry.description,
        entry.projectName,
        entry.recordTitle,
        entry.result === "pass" ? "Pass" : "Fail",
      ];
    case "active_issues":
      return [
        entry.title,
        entry.projectName,
        formatLabel(entry.priority),
        formatLabel(entry.status),
      ];
    case "attention_projects":
      return [entry.projectName];
  }
}

function getEntryLabel(entry: WorkspaceMetricEntry): string {
  switch (entry.kind) {
    case "assets":
      return entry.tag;
    case "test_results":
      return entry.description;
    case "active_issues":
      return entry.title;
    case "attention_projects":
      return entry.projectName;
  }
}

function TitleButton({
  entry,
  onOpenEntry,
  children,
}: {
  entry: WorkspaceMetricEntry;
  onOpenEntry: (entry: WorkspaceMetricEntry) => void;
  children: ReactNode;
}) {
  return (
    <button
      className="test-record-title-button workspace-metric-item-button"
      type="button"
      aria-label={`Open ${getEntryLabel(entry)}`}
      onClick={() => onOpenEntry(entry)}
    >
      <strong className="issue-title-text">{children}</strong>
    </button>
  );
}

function CountCell({ value }: { value: number }) {
  return (
    <td className="numeric-column">
      <span className={`workspace-metric-count ${value > 0 ? "attention" : "clear"}`}>
        {value}
      </span>
    </td>
  );
}

function renderHeader(kind: WorkspaceMetricKind) {
  switch (kind) {
    case "assets":
      return (
        <tr>
          <th>Asset</th>
          <th>Name</th>
          <th>Project</th>
          <th>System</th>
          <th className="status-column">Status</th>
        </tr>
      );
    case "test_results":
      return (
        <tr>
          <th>Test item</th>
          <th>Project</th>
          <th>Record</th>
          <th className="status-column">Result</th>
        </tr>
      );
    case "active_issues":
      return (
        <tr>
          <th>Issue</th>
          <th>Project</th>
          <th className="status-column">Priority</th>
          <th className="status-column">Status</th>
          <th>Due date</th>
        </tr>
      );
    case "attention_projects":
      return (
        <tr>
          <th>Project</th>
          <th className="numeric-column">Critical issues</th>
          <th className="numeric-column">Overdue issues</th>
          <th className="numeric-column">Failed test items</th>
          <th className="numeric-column">Blocked assets</th>
        </tr>
      );
  }
}

function renderCells(
  entry: WorkspaceMetricEntry,
  onOpenEntry: (entry: WorkspaceMetricEntry) => void,
) {
  switch (entry.kind) {
    case "assets":
      return (
        <>
          <td>
            <TitleButton entry={entry} onOpenEntry={onOpenEntry}>
              {entry.tag}
            </TitleButton>
          </td>
          <td>{entry.name || "-"}</td>
          <td>{entry.projectName}</td>
          <td>{entry.system || "-"}</td>
          <td className="status-cell">
            <span className={`status-badge ${entry.status}`}>
              {formatLabel(entry.status)}
            </span>
          </td>
        </>
      );
    case "test_results":
      return (
        <>
          <td>
            <TitleButton entry={entry} onOpenEntry={onOpenEntry}>
              {entry.description}
            </TitleButton>
          </td>
          <td>{entry.projectName}</td>
          <td>{entry.recordTitle}</td>
          <td className="status-cell">
            <span className={`test-item-result ${entry.result}`}>
              {entry.result === "pass" ? "Pass" : "Fail"}
            </span>
          </td>
        </>
      );
    case "active_issues":
      return (
        <>
          <td>
            <TitleButton entry={entry} onOpenEntry={onOpenEntry}>
              {entry.title}
            </TitleButton>
          </td>
          <td>{entry.projectName}</td>
          <td className="status-cell">
            <span className={`status-badge issue-priority-${entry.priority}`}>
              {formatLabel(entry.priority)}
            </span>
          </td>
          <td className="status-cell">
            <span className={`status-badge issue-status-${entry.status}`}>
              {formatLabel(entry.status)}
            </span>
          </td>
          <td>
            <span
              className={entry.isOverdue ? "workspace-metric-overdue" : undefined}
              title={entry.isOverdue ? "Overdue" : undefined}
            >
              {formatDueDate(entry.dueDate)}
            </span>
          </td>
        </>
      );
    case "attention_projects":
      return (
        <>
          <td>
            <TitleButton entry={entry} onOpenEntry={onOpenEntry}>
              {entry.projectName}
            </TitleButton>
          </td>
          <CountCell value={entry.criticalIssues} />
          <CountCell value={entry.overdueIssues} />
          <CountCell value={entry.failedTestItems} />
          <CountCell value={entry.blockedAssets} />
        </>
      );
  }
}

export default function WorkspaceMetricPage({
  kind,
  onBack,
  onOpenEntry,
}: WorkspaceMetricPageProps) {
  const [entries, setEntries] = useState<WorkspaceMetricEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const filterDefinition = workspaceMetricFilters[kind];
  const showProjectFilter = kind !== "attention_projects";
  const label = workspaceMetricLabels[kind];

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    listWorkspaceMetricEntries(kind)
      .then((result) => {
        if (!cancelled) {
          setEntries(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load entries.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [kind, refreshSequence]);

  const { options, projects } = getWorkspaceMetricFilterOptions(
    kind,
    entries,
    filter,
    projectFilter,
  );
  const query = search.trim().toLowerCase();
  const visibleEntries = entries.filter(
    (entry) =>
      matchesWorkspaceMetricFilter(kind, entry, filter) &&
      (projectFilter === "all" || entry.projectId === projectFilter) &&
      getSearchValues(entry).some((value) =>
        value.toLowerCase().includes(query),
      ),
  );

  return (
    <TablePage className="workspace-metric-page">
      <div className="card-header test-record-page-header">
        <div className="test-record-page-heading">
          <button
            className="back-navigation-button"
            type="button"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span>
            Back to Home
          </button>
          <h3>{label}</h3>
          <p>{descriptions[kind]}</p>
        </div>
      </div>

      <ListToolbar filterCount={showProjectFilter ? 2 : 1} hasAction={false}>
        <input
          className="project-search-input"
          type="search"
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder={searchPlaceholders[kind]}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {showProjectFilter && (
          <FilterSelect
            className="project-status-filter"
            aria-label="Filter by project"
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
          >
            <option value="all">All projects</option>
            {projects.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </FilterSelect>
        )}
        <FilterSelect
          className="project-status-filter"
          aria-label={filterDefinition.ariaLabel}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">{filterDefinition.allLabel}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        {!isLoading && !loadError && (
          <span className="project-result-count" role="status">
            {visibleEntries.length} of {entries.length}
          </span>
        )}
      </ListToolbar>

      {isLoading ? (
        <div className="empty-state" role="status">
          Loading entries...
        </div>
      ) : loadError ? (
        <div className="empty-state" role="alert">
          <h3>Unable to load entries</h3>
          <p>{loadError}</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setRefreshSequence((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="empty-state">
          <h3>{entries.length === 0 ? "No entries yet" : "No matching entries"}</h3>
        </div>
      ) : (
        <FixedHeaderTable
          className={`projects-table workspace-metric-table ${kind}`}
          ariaLabel={`${label} across all projects`}
          header={renderHeader(kind)}
          body={visibleEntries.map((entry) => (
            <ClickableTableRow
              key={entry.id}
              onOpen={() => onOpenEntry(entry)}
            >
              {renderCells(entry, onOpenEntry)}
            </ClickableTableRow>
          ))}
        />
      )}
    </TablePage>
  );
}
