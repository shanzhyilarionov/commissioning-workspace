import { useEffect, useState } from "react";
import ClickableTableRow from "../components/ClickableTableRow";
import FixedHeaderTable from "../components/FixedHeaderTable";
import ListToolbar from "../components/ListToolbar";
import TablePage from "../components/TablePage";
import { listWorkspaceDeliverables } from "../repositories/workspaceDeliverableRepository";
import { listStructureReadinessSummaries } from "../repositories/readinessRepository";
import { getWorkspaceDeliverableFilterOptions } from "../services/workspaceDeliverableFilters";
import type { Project } from "../types/project";
import {
  deliverableLabels,
  type WorkspaceDeliverable,
  type WorkspaceDeliverableKind,
} from "../types/workspaceDeliverable";
import FilterSelect from "../components/FilterSelect";

interface WorkspaceDeliverablesPageProps {
  kind: WorkspaceDeliverableKind;
  project?: Project | null;
  onBack: () => void;
  onOpenItem: (item: WorkspaceDeliverable) => void;
}

const statusOptions: Record<WorkspaceDeliverableKind, readonly string[]> = {
  required_documents: ["draft", "for_review", "approved", "superseded"],
  test_records: ["unsigned", "signed_off"],
  subsystem_handover: [
    "not_started", "in_progress", "ready", "commissioned", "handed_over",
  ],
};

const detailLabels: Record<WorkspaceDeliverableKind, string> = {
  required_documents: "Revision",
  test_records: "Test progress",
  subsystem_handover: "Asset completion",
};

function formatStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export default function WorkspaceDeliverablesPage({
  kind,
  project = null,
  onBack,
  onOpenItem,
}: WorkspaceDeliverablesPageProps) {
  const [items, setItems] = useState<WorkspaceDeliverable[]>([]);
  const [blockerCounts, setBlockerCounts] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const showBlockers = project !== null && kind === "subsystem_handover";

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    void Promise.all([
      listWorkspaceDeliverables(kind, project?.id),
      project && kind === "subsystem_handover"
        ? listStructureReadinessSummaries(project.id)
        : Promise.resolve([]),
    ])
      .then(([result, summaries]) => {
        if (!cancelled) {
          setItems(result);
          setBlockerCounts(new Map(
            summaries
              .filter((summary) => summary.kind === "subsystem")
              .map((summary) => [summary.structureId, summary.blockerCount]),
          ));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load deliverables.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kind, project?.id, refreshSequence]);

  const { statuses, projects } = getWorkspaceDeliverableFilterOptions(
    items,
    statusFilter,
    projectFilter,
  );
  const query = search.trim().toLowerCase();
  const visibleItems = items.filter(
    (item) =>
      (statusFilter === "all" || item.status === statusFilter) &&
      (projectFilter === "all" || item.projectId === projectFilter) &&
      [
        item.title,
        item.projectName,
        item.context,
        formatStatus(item.status),
        item.kind === "required_documents" ? item.revision : "",
      ].some((value) => value.toLowerCase().includes(query)),
  );

  return (
    <TablePage className="deliverables-page">
      <div className="card-header test-record-page-header">
        <div className="test-record-page-heading">
          <button
            className="back-navigation-button"
            type="button"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span>
            {project ? "Back to Overview" : "Back to Home"}
          </button>
          <h3>{deliverableLabels[kind]}</h3>
          <p>
            {project
              ? `Deliverables for ${project.name}.`
              : "All entries across your workspace, including archived projects."}
          </p>
        </div>
      </div>

      <ListToolbar filterCount={project ? 1 : 2} hasAction={false}>
        <input
          className="project-search-input"
          type="search"
          aria-label="Search deliverables"
          placeholder={project ? "Search subsystems or systems..." : "Search items, projects, or scope..."}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {!project && (
          <FilterSelect
            className="project-status-filter"
            aria-label="Filter by project"
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
          >
            <option value="all">All projects</option>
            {projects.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </FilterSelect>
        )}
        <FilterSelect
          className="project-status-filter"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          {statusOptions[kind].filter((status) => statuses.has(status)).map((status) => (
            <option key={status} value={status}>{formatStatus(status)}</option>
          ))}
        </FilterSelect>
        {!isLoading && !loadError && (
          <span className="project-result-count" role="status">
            {visibleItems.length} of {items.length}
          </span>
        )}
      </ListToolbar>

      {isLoading ? (
        <div className="empty-state" role="status">Loading deliverables...</div>
      ) : loadError ? (
        <div className="empty-state" role="alert">
          <h3>Unable to load deliverables</h3>
          <p>{loadError}</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setRefreshSequence((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="empty-state">
          <h3>{items.length === 0 ? "No entries yet" : "No matching entries"}</h3>
          <p>
            {items.length === 0
              ? `No ${deliverableLabels[kind].toLowerCase()} in ${project ? "this project" : "your workspace"}.`
              : project
                ? "Try a different search or status filter."
                : "Try a different search, status, or project filter."}
          </p>
        </div>
      ) : (
        <FixedHeaderTable
          className={`projects-table deliverables-table ${kind}${showBlockers ? " project-subsystem-handover" : ""}`}
          ariaLabel={`${deliverableLabels[kind]} ${project ? `for ${project.name}` : "across all projects"}`}
          header={
            <tr>
              <th>Item</th>
              {!showBlockers && <th>Project</th>}
              <th>{kind === "subsystem_handover" ? "System" : "Asset"}</th>
              <th className="status-column">Status</th>
              {showBlockers && <th className="numeric-column">Blockers</th>}
              <th className={kind === "required_documents" ? undefined : "numeric-column"}>{detailLabels[kind]}</th>
            </tr>
          }
          body={visibleItems.map((item) => (
            <ClickableTableRow key={item.id} onOpen={() => onOpenItem(item)}>
              <td>
                <button
                  className="test-record-title-button deliverables-item-button"
                  type="button"
                  onClick={() => onOpenItem(item)}
                >
                  <strong className="issue-title-text">{item.title}</strong>
                </button>
              </td>
              {!showBlockers && <td>{item.projectName}</td>}
              <td>{item.context || "-"}</td>
              <td className="status-cell">
                <span className={`status-badge ${item.status}`}>
                  {formatStatus(item.status)}
                </span>
              </td>
              {showBlockers && (
                <td className="numeric-column">
                  <span
                    className={`deliverables-blocker-count ${
                      blockerCounts.get(item.id) === undefined
                        ? ""
                        : blockerCounts.get(item.id) === 0 ? "clear" : "blocked"
                    }`}
                    title="Outstanding readiness blockers"
                  >
                    {blockerCounts.get(item.id) ?? "-"}
                  </span>
                </td>
              )}
              <td className={item.kind === "required_documents" ? undefined : "numeric-column"}>
                {item.kind === "required_documents" ? (
                  item.revision || "-"
                ) : (
                  <span
                    title={item.kind === "test_records"
                      ? "Assessed test items / total test items"
                      : "Completed assets / total assets"}
                  >
                    {item.completedCount} / {item.totalCount}
                  </span>
                )}
              </td>
            </ClickableTableRow>
          ))}
        />
      )}
    </TablePage>
  );
}
