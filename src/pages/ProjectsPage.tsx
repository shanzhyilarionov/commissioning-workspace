import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  Project,
  ProjectStatus,
} from "../types/project";

interface ProjectsPageProps {
  projects: Project[];
  currentProjectId: string | null;
  changingProjectStatusId: string | null;
  actionError: string | null;
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onEditProject: (project: Project) => void;
  onArchiveProject: (project: Project) => void;
  onRestoreProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
}

type ProjectStatusFilter = "all" | ProjectStatus;

function formatProjectStatus(status: ProjectStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function ProjectsPage({
  projects,
  currentProjectId,
  changingProjectStatusId,
  actionError,
  onCreateProject,
  onSelectProject,
  onEditProject,
  onArchiveProject,
  onRestoreProject,
  onDeleteProject,
}: ProjectsPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<ProjectStatusFilter>("active");
  const [openMenuProjectId, setOpenMenuProjectId] =
    useState<string | null>(null);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;

      if (
        target instanceof Element &&
        !target.closest(".project-action-menu")
      ) {
        setOpenMenuProjectId(null);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuProjectId(null);
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

  const filteredProjects = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesStatus =
        statusFilter === "all" ||
        project.status === statusFilter;

      const matchesSearch =
        normalizedQuery.length === 0 ||
        project.name.toLowerCase().includes(normalizedQuery) ||
        project.client.toLowerCase().includes(normalizedQuery) ||
        project.location.toLowerCase().includes(normalizedQuery);

      return matchesStatus && matchesSearch;
    });
  }, [projects, searchQuery, statusFilter]);

  const resultCountText =
    `${filteredProjects.length} of ${projects.length}`;

  const emptyStateTitle = useMemo(() => {
    if (searchQuery.trim()) {
      return "No matching projects";
    }

    if (statusFilter === "all") {
      return "No projects";
    }

    return `No ${statusFilter} projects`;
  }, [searchQuery, statusFilter]);

  const emptyStateMessage = useMemo(() => {
    if (searchQuery.trim()) {
      return "Change the search text or status filter.";
    }

    if (statusFilter === "archived") {
      return "Archived projects will appear here.";
    }

    return "Change the status filter to view other projects.";
  }, [searchQuery, statusFilter]);

  return (
    <section className="content-card section-card projects-card">
      <div className="projects-header">
        <div>
          <h3>Projects</h3>
          <p>Create, open, and manage commissioning projects.</p>
        </div>

        {projects.length === 0 && (
          <button
            className="primary-button"
            type="button"
            onClick={onCreateProject}
          >
            New project
          </button>
        )}
      </div>

      {projects.length > 0 && (
        <div className="projects-toolbar">
          <input
            className="project-search-input"
            type="search"
            value={searchQuery}
            placeholder="Search name, client, or location"
            aria-label="Search projects"
            onChange={(event) =>
              setSearchQuery(event.target.value)
            }
          />

          <select
            className="project-status-filter"
            value={statusFilter}
            aria-label="Filter projects by status"
            onChange={(event) =>
              setStatusFilter(
                event.target.value as ProjectStatusFilter,
              )
            }
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
            <option value="all">All statuses</option>
          </select>

          <button
            className="primary-button toolbar-primary-button"
            type="button"
            onClick={onCreateProject}
          >
            New project
          </button>

          <span className="project-result-count">
            {resultCountText}
          </span>
        </div>
      )}

      {actionError && (
        <p className="projects-action-error" role="alert">
          {actionError}
        </p>
      )}

      {projects.length === 0 ? (
        <div className="empty-state">
          <h3>No projects yet</h3>
          <p>
            Create your first commissioning project to get started.
          </p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="empty-state compact">
          <h3>{emptyStateTitle}</h3>
          <p>{emptyStateMessage}</p>
        </div>
      ) : (
        <div className="projects-table-wrapper projects-list-table-wrapper">
          <table className="projects-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Client</th>
                <th>Location</th>
                <th className="status-column">Status</th>
                <th>Updated</th>
                <th aria-label="Project actions" />
              </tr>
            </thead>

            <tbody>
              {filteredProjects.map((project) => {
                const isCurrentProject =
                  project.id === currentProjectId;

                const isChangingStatus =
                  project.id === changingProjectStatusId;

                const isMenuOpen =
                  project.id === openMenuProjectId;

                const isArchived =
                  project.status === "archived";

                return (
                  <tr
                    key={project.id}
                    className={
                      isCurrentProject
                        ? "current-project-row"
                        : undefined
                    }
                  >
                    <td>
                      <strong>{project.name}</strong>

                      {isCurrentProject && (
                        <span className="current-label">
                          Current
                        </span>
                      )}
                    </td>

                    <td>{project.client || "—"}</td>

                    <td>{project.location || "—"}</td>

                    <td className="status-cell">
                      <span
                        className={`status-badge ${project.status}`}
                      >
                        {formatProjectStatus(project.status)}
                      </span>
                    </td>

                    <td className="project-updated-cell">
                      {new Date(
                        project.updatedAt,
                      ).toLocaleDateString("en-CA")}
                    </td>

                    <td className="table-action-cell">
                      <div className="project-row-actions">
                        <button
                          className={
                            isCurrentProject
                              ? "row-action-button project-open-placeholder"
                              : "row-action-button"
                          }
                          type="button"
                          disabled={isChangingStatus || isCurrentProject}
                          aria-hidden={isCurrentProject}
                          tabIndex={isCurrentProject ? -1 : 0}
                          onClick={() => {
                            if (!isCurrentProject) {
                              onSelectProject(project.id);
                            }
                          }}
                        >
                          Open
                        </button>

                        <button
                          className="row-action-button"
                          type="button"
                          disabled={isChangingStatus}
                          onClick={() =>
                            onEditProject(project)
                          }
                        >
                          Edit
                        </button>

                        <div className="project-action-menu">
                          <button
                            className="more-actions-button"
                            type="button"
                            aria-label={`More actions for ${project.name}`}
                            aria-haspopup="menu"
                            aria-expanded={isMenuOpen}
                            disabled={isChangingStatus}
                            onClick={() =>
                              setOpenMenuProjectId(
                                isMenuOpen
                                  ? null
                                  : project.id,
                              )
                            }
                          >
                            ⋯
                          </button>

                          {isMenuOpen && (
                            <div
                              className="project-action-menu-panel"
                              role="menu"
                            >
                              {isArchived ? (
                                <button
                                  className="project-menu-item"
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuProjectId(null);
                                    onRestoreProject(project);
                                  }}
                                >
                                  Restore project
                                </button>
                              ) : (
                                <button
                                  className="project-menu-item"
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuProjectId(null);
                                    onArchiveProject(project);
                                  }}
                                >
                                  Archive project
                                </button>
                              )}

                              <button
                                className="project-menu-item danger"
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenMenuProjectId(null);
                                  onDeleteProject(project);
                                }}
                              >
                                Delete project
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
  );
}

export default ProjectsPage;