import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import FixedHeaderTable from "../components/FixedHeaderTable";

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

interface ProjectMenuPosition {
  left: number;
  top: number;
}

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
  const [menuPosition, setMenuPosition] =
    useState<ProjectMenuPosition | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  const closeProjectMenu = useCallback(() => {
    setOpenMenuProjectId(null);
    setMenuPosition(null);
    menuButtonRef.current = null;
  }, []);

  const updateProjectMenuPosition = useCallback(() => {
    const button = menuButtonRef.current;
    const panel = menuPanelRef.current;

    if (!button || !panel) {
      return;
    }

    const buttonRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const viewportPadding = 8;
    const menuGap = 6;
    const availableBelow = window.innerHeight - buttonRect.bottom;
    const openAbove =
      availableBelow < panelRect.height + menuGap + viewportPadding &&
      buttonRect.top > availableBelow;
    const unclampedTop = openAbove
      ? buttonRect.top - panelRect.height - menuGap
      : buttonRect.bottom + menuGap;
    const maxLeft = Math.max(
      viewportPadding,
      window.innerWidth - panelRect.width - viewportPadding,
    );
    const maxTop = Math.max(
      viewportPadding,
      window.innerHeight - panelRect.height - viewportPadding,
    );

    setMenuPosition({
      left: Math.min(
        Math.max(
          viewportPadding,
          buttonRect.right - panelRect.width,
        ),
        maxLeft,
      ),
      top: Math.min(
        Math.max(viewportPadding, unclampedTop),
        maxTop,
      ),
    });
  }, []);

  useLayoutEffect(() => {
    if (openMenuProjectId) {
      updateProjectMenuPosition();
    }
  }, [openMenuProjectId, updateProjectMenuPosition]);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;

      if (
        target instanceof Element &&
        !target.closest("[data-project-action-menu]")
      ) {
        closeProjectMenu();
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeProjectMenu();
      }
    }

    function handleViewportChange() {
      closeProjectMenu();
    }

    document.addEventListener(
      "mousedown",
      handleDocumentMouseDown,
    );
    document.addEventListener(
      "keydown",
      handleDocumentKeyDown,
    );
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener(
        "mousedown",
        handleDocumentMouseDown,
      );
      document.removeEventListener(
        "keydown",
        handleDocumentKeyDown,
      );
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener(
        "scroll",
        handleViewportChange,
        true,
      );
    };
  }, [closeProjectMenu]);

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
        <FixedHeaderTable
          className="projects-table projects-list-table"
          wrapperClassName="projects-list-table-wrapper"
          ariaLabel="Projects"
          colGroup={
            <colgroup>
                          <col />
                          <col />
                          <col />
                          <col className="project-status-column-width" />
                          <col className="table-date-column-width" />
                          <col className="project-actions-column-width" />
                        </colgroup>
          }
          header={
            <tr>
                            <th>Name</th>
                            <th>Client</th>
                            <th>Location</th>
                            <th className="status-column">Status</th>
                            <th>Updated</th>
                            <th aria-label="Project actions" />
                          </tr>
          }
          body={
            <>
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

                                  <td>{project.client || "-"}</td>

                                  <td>{project.location || "-"}</td>

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
                                        disabled={
                                          isChangingStatus ||
                                          isCurrentProject
                                        }
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

                                      <div
                                        className="project-action-menu"
                                        data-project-action-menu
                                      >
                                        <button
                                          className="more-actions-button"
                                          type="button"
                                          aria-label={`More actions for ${project.name}`}
                                          aria-haspopup="menu"
                                          aria-expanded={isMenuOpen}
                                          disabled={isChangingStatus}
                                          onClick={(event) => {
                                            if (isMenuOpen) {
                                              closeProjectMenu();
                                              return;
                                            }

                                            menuButtonRef.current =
                                              event.currentTarget;
                                            setMenuPosition(null);
                                            setOpenMenuProjectId(
                                              project.id,
                                            );
                                          }}
                                        >
                                          ⋯
                                        </button>

                                        {isMenuOpen &&
                                          createPortal(
                                            <div
                                              ref={menuPanelRef}
                                              className="project-action-menu-panel"
                                              data-project-action-menu
                                              role="menu"
                                              style={
                                                menuPosition
                                                  ? menuPosition
                                                  : {
                                                      left: 0,
                                                      top: 0,
                                                      visibility: "hidden",
                                                    }
                                              }
                                            >
                                              {isArchived ? (
                                                <button
                                                  className="project-menu-item"
                                                  type="button"
                                                  role="menuitem"
                                                  onClick={() => {
                                                    closeProjectMenu();
                                                    onRestoreProject(
                                                      project,
                                                    );
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
                                                    closeProjectMenu();
                                                    onArchiveProject(
                                                      project,
                                                    );
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
                                                  closeProjectMenu();
                                                  onDeleteProject(
                                                    project,
                                                  );
                                                }}
                                              >
                                                Delete project
                                              </button>
                                            </div>,
                                            document.body,
                                          )}
                                      </div>
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
  );
}

export default ProjectsPage;
