import {
  useEffect,
  useMemo,
  useState,
} from "react";

import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import IssueModal from "../components/IssueModal";
import { listAssetsByProject } from "../repositories/assetRepository";
import {
  createIssue,
  deleteIssue,
  listIssuesByProject,
  reopenIssue,
  resolveIssue,
  updateIssue,
} from "../repositories/issueRepository";
import type { Asset } from "../types/asset";
import type {
  Issue,
  IssueInput,
  IssuePriority,
  IssueStatus,
} from "../types/issue";
import type { Project } from "../types/project";

interface IssuesPageProps {
  currentProject: Project;
}

type IssueStatusFilter = "all" | IssueStatus;
type IssuePriorityFilter = "all" | IssuePriority;

const priorityOrder: Record<IssuePriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function formatIssueStatus(status: IssueStatus) {
  switch (status) {
    case "open":
      return "Open";

    case "in_progress":
      return "In progress";

    case "resolved":
      return "Resolved";

    case "closed":
      return "Closed";
  }
}

function formatIssuePriority(priority: IssuePriority) {
  switch (priority) {
    case "low":
      return "Low";

    case "medium":
      return "Medium";

    case "high":
      return "High";

    case "critical":
      return "Critical";
  }
}

function formatDueDate(dueDate: string | null) {
  if (!dueDate) {
    return "—";
  }

  return new Date(
    `${dueDate}T00:00:00`,
  ).toLocaleDateString("en-CA");
}

function sortIssues(issues: Issue[]) {
  return [...issues].sort((first, second) => {
    const priorityComparison =
      priorityOrder[first.priority] -
      priorityOrder[second.priority];

    if (priorityComparison !== 0) {
      return priorityComparison;
    }

    return (
      new Date(second.updatedAt).getTime() -
      new Date(first.updatedAt).getTime()
    );
  });
}

function IssuesPage({
  currentProject,
}: IssuesPageProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] =
    useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  const [statusFilter, setStatusFilter] =
    useState<IssueStatusFilter>("all");

  const [priorityFilter, setPriorityFilter] =
    useState<IssuePriorityFilter>("all");

  const [isIssueModalOpen, setIsIssueModalOpen] =
    useState(false);

  const [editingIssue, setEditingIssue] =
    useState<Issue | null>(null);

  const [issueToDelete, setIssueToDelete] =
    useState<Issue | null>(null);

  const [isDeletingIssue, setIsDeletingIssue] =
    useState(false);

  const [issueDeleteError, setIssueDeleteError] =
    useState<string | null>(null);

  const [openMenuIssueId, setOpenMenuIssueId] =
    useState<string | null>(null);

  const [
    changingIssueStatusId,
    setChangingIssueStatusId,
  ] = useState<string | null>(null);

  const [issueActionError, setIssueActionError] =
    useState<string | null>(null);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;

      if (
        target instanceof Element &&
        !target.closest(".project-action-menu")
      ) {
        setOpenMenuIssueId(null);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuIssueId(null);
      }
    }

    document.addEventListener(
      "mousedown",
      handleDocumentMouseDown,
    );

    document.addEventListener(
      "keydown",
      handleDocumentKeyDown,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleDocumentMouseDown,
      );

      document.removeEventListener(
        "keydown",
        handleDocumentKeyDown,
      );
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadIssuesPageData() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [storedIssues, storedAssets] =
          await Promise.all([
            listIssuesByProject(currentProject.id),
            listAssetsByProject(currentProject.id),
          ]);

        if (!cancelled) {
          setIssues(sortIssues(storedIssues));
          setAssets(storedAssets);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load issues.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    setSearchQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setEditingIssue(null);
    setIsIssueModalOpen(false);
    setIssueToDelete(null);
    setIssueDeleteError(null);
    setOpenMenuIssueId(null);
    setChangingIssueStatusId(null);
    setIssueActionError(null);

    void loadIssuesPageData();

    return () => {
      cancelled = true;
    };
  }, [currentProject.id]);

  const filteredIssues = useMemo(() => {
    const normalizedQuery =
      searchQuery.trim().toLowerCase();

    return issues.filter((issue) => {
      const matchesStatus =
        statusFilter === "all" ||
        issue.status === statusFilter;

      const matchesPriority =
        priorityFilter === "all" ||
        issue.priority === priorityFilter;

      const matchesSearch =
        normalizedQuery.length === 0 ||
        issue.title
          .toLowerCase()
          .includes(normalizedQuery) ||
        issue.description
          .toLowerCase()
          .includes(normalizedQuery) ||
        issue.owner
          .toLowerCase()
          .includes(normalizedQuery) ||
        issue.assetTag
          ?.toLowerCase()
          .includes(normalizedQuery) === true ||
        issue.assetName
          ?.toLowerCase()
          .includes(normalizedQuery) === true;

      return (
        matchesStatus &&
        matchesPriority &&
        matchesSearch
      );
    });
  }, [
    issues,
    searchQuery,
    statusFilter,
    priorityFilter,
  ]);

  function handleCreateIssue() {
    setOpenMenuIssueId(null);
    setEditingIssue(null);
    setIssueActionError(null);
    setIsIssueModalOpen(true);
  }

  function handleEditIssue(issue: Issue) {
    setOpenMenuIssueId(null);
    setEditingIssue(issue);
    setIssueActionError(null);
    setIsIssueModalOpen(true);
  }

  function handleCloseIssueModal() {
    setIsIssueModalOpen(false);
    setEditingIssue(null);
  }

  async function handleSaveIssue(
    input: IssueInput,
  ): Promise<void> {
    if (editingIssue) {
      const updatedIssue = await updateIssue(
        editingIssue.id,
        input,
      );

      setIssues((current) =>
        sortIssues(
          current.map((issue) =>
            issue.id === updatedIssue.id
              ? updatedIssue
              : issue,
          ),
        ),
      );
    } else {
      const createdIssue = await createIssue(
        currentProject.id,
        input,
      );

      setIssues((current) =>
        sortIssues([...current, createdIssue]),
      );
    }

    handleCloseIssueModal();
  }

  async function handleToggleIssueResolved(
    issue: Issue,
  ) {
    if (changingIssueStatusId !== null) {
      return;
    }

    setOpenMenuIssueId(null);
    setChangingIssueStatusId(issue.id);
    setIssueActionError(null);

    try {
      const updatedIssue =
        issue.status === "resolved" ||
        issue.status === "closed"
          ? await reopenIssue(issue.id)
          : await resolveIssue(issue.id);

      setIssues((current) =>
        sortIssues(
          current.map((currentIssue) =>
            currentIssue.id === updatedIssue.id
              ? updatedIssue
              : currentIssue,
          ),
        ),
      );
    } catch (error) {
      setIssueActionError(
        error instanceof Error
          ? error.message
          : "Failed to update the issue status.",
      );
    } finally {
      setChangingIssueStatusId(null);
    }
  }

  function handleRequestDeleteIssue(issue: Issue) {
    setOpenMenuIssueId(null);
    setIssueDeleteError(null);
    setIssueToDelete(issue);
  }

  function handleCloseDeleteIssue() {
    if (isDeletingIssue) {
      return;
    }

    setIssueToDelete(null);
    setIssueDeleteError(null);
  }

  async function handleConfirmDeleteIssue() {
    if (!issueToDelete) {
      return;
    }

    const issue = issueToDelete;

    setIsDeletingIssue(true);
    setIssueDeleteError(null);

    try {
      await deleteIssue(issue.id);

      setIssues((current) =>
        current.filter(
          (currentIssue) =>
            currentIssue.id !== issue.id,
        ),
      );

      setEditingIssue((current) =>
        current?.id === issue.id ? null : current,
      );

      setIssueToDelete(null);
    } catch (error) {
      setIssueDeleteError(
        error instanceof Error
          ? error.message
          : "Failed to delete the issue.",
      );
    } finally {
      setIsDeletingIssue(false);
    }
  }

  if (isLoading) {
    return (
      <section className="content-card placeholder">
        <h3>Loading issues</h3>

        <p>
          Reading commissioning issues for{" "}
          {currentProject.name}.
        </p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="content-card placeholder">
        <h3>Unable to load issues</h3>
        <p>{loadError}</p>
      </section>
    );
  }

  return (
    <>
      <section className="content-card section-card assets-card">
        <div className="projects-header">
          <div>
            <h3>Issues</h3>

            <p>
              Track commissioning deficiencies and
              outstanding work for {currentProject.name}.
            </p>
          </div>
        </div>

        <div className="assets-toolbar issues-toolbar">
          <input
            className="asset-search-input"
            type="search"
            value={searchQuery}
            placeholder="Search title, asset, or owner"
            aria-label="Search issues"
            onChange={(event) =>
              setSearchQuery(event.target.value)
            }
          />

          <select
            className="asset-status-filter"
            value={statusFilter}
            aria-label="Filter issues by status"
            onChange={(event) =>
              setStatusFilter(
                event.target
                  .value as IssueStatusFilter,
              )
            }
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">
              In progress
            </option>
            <option value="resolved">
              Resolved
            </option>
            <option value="closed">Closed</option>
          </select>

          <select
            className="asset-status-filter"
            value={priorityFilter}
            aria-label="Filter issues by priority"
            onChange={(event) =>
              setPriorityFilter(
                event.target
                  .value as IssuePriorityFilter,
              )
            }
          >
            <option value="all">All priorities</option>
            <option value="critical">
              Critical
            </option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <button
            className="primary-button toolbar-primary-button"
            type="button"
            onClick={handleCreateIssue}
          >
            New issue
          </button>

          <span className="asset-result-count">
            {filteredIssues.length} of {issues.length}
          </span>
        </div>

        {issueActionError && (
          <p
            className="form-submit-error"
            role="alert"
          >
            {issueActionError}
          </p>
        )}

        {issues.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">+</div>

            <h3>No issues yet</h3>

            <p>
              Add the first commissioning issue for this
              project.
            </p>
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="empty-state compact">
            <h3>No matching issues</h3>

            <p>
              Change the search text, status, or priority
              filter.
            </p>
          </div>
        ) : (
          <div className="projects-table-wrapper assets-table-wrapper">
            <table className="projects-table assets-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Asset</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Due</th>
                  <th>Updated</th>
                  <th aria-label="Issue actions" />
                </tr>
              </thead>

              <tbody>
                {filteredIssues.map((issue) => {
                  const isClosed =
                    issue.status === "resolved" ||
                    issue.status === "closed";

                  const isChangingStatus =
                    changingIssueStatusId === issue.id;

                  return (
                    <tr key={issue.id}>
                      <td>
                        <strong className="asset-tag">
                          {issue.title}
                        </strong>
                      </td>

                      <td>
                        {issue.assetTag ? (
                          <>
                            <strong>
                              {issue.assetTag}
                            </strong>

                            {issue.assetName
                              ? ` — ${issue.assetName}`
                              : ""}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td>
                        <span
                          className={`status-badge issue-priority-${issue.priority}`}
                        >
                          {formatIssuePriority(
                            issue.priority,
                          )}
                        </span>
                      </td>

                      <td className="status-cell">
                        <span
                          className={`status-badge ${issue.status}`}
                        >
                          {formatIssueStatus(
                            issue.status,
                          )}
                        </span>
                      </td>

                      <td>{issue.owner || "—"}</td>

                      <td>
                        {formatDueDate(issue.dueDate)}
                      </td>

                      <td className="project-updated-cell">
                        {new Date(
                          issue.updatedAt,
                        ).toLocaleDateString("en-CA")}
                      </td>

                      <td className="table-action-cell">
                        <div className="project-row-actions">
                          <button
                            className="row-action-button"
                            type="button"
                            onClick={() =>
                              handleEditIssue(issue)
                            }
                          >
                            Edit
                          </button>

                          <div className="project-action-menu">
                            <button
                              className="more-actions-button"
                              type="button"
                              aria-label={`More actions for ${issue.title}`}
                              aria-haspopup="menu"
                              aria-expanded={
                                openMenuIssueId ===
                                issue.id
                              }
                              onClick={() =>
                                setOpenMenuIssueId(
                                  (current) =>
                                    current === issue.id
                                      ? null
                                      : issue.id,
                                )
                              }
                            >
                              ⋯
                            </button>

                            {openMenuIssueId ===
                              issue.id && (
                              <div
                                className="project-action-menu-panel"
                                role="menu"
                              >
                                <button
                                  className="project-menu-item"
                                  type="button"
                                  role="menuitem"
                                  disabled={
                                    isChangingStatus
                                  }
                                  onClick={() => {
                                    void handleToggleIssueResolved(
                                      issue,
                                    );
                                  }}
                                >
                                  {isChangingStatus
                                    ? "Updating..."
                                    : isClosed
                                      ? "Reopen issue"
                                      : "Mark resolved"}
                                </button>

                                <button
                                  className="project-menu-item danger"
                                  type="button"
                                  role="menuitem"
                                  onClick={() =>
                                    handleRequestDeleteIssue(
                                      issue,
                                    )
                                  }
                                >
                                  Delete issue
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <IssueModal
        isOpen={isIssueModalOpen}
        assets={assets}
        issue={editingIssue}
        onClose={handleCloseIssueModal}
        onSave={handleSaveIssue}
      />

      <DeleteConfirmationModal
        isOpen={issueToDelete !== null}
        title="Delete issue"
        message={
          issueToDelete ? (
            <>
              Delete issue{" "}
              <strong>{issueToDelete.title}</strong>?
              This action cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete issue"
        submittingLabel="Deleting issue..."
        isSubmitting={isDeletingIssue}
        error={issueDeleteError}
        onClose={handleCloseDeleteIssue}
        onConfirm={() => {
          void handleConfirmDeleteIssue();
        }}
      />
    </>
  );
}

export default IssuesPage;