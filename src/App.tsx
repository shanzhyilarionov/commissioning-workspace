import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import CreateProjectModal from "./components/CreateProjectModal";
import DeleteConfirmationModal from "./components/DeleteConfirmationModal";
import EditProjectModal from "./components/EditProjectModal";
import AssetsPage from "./pages/AssetsPage";
import ProjectOverviewPage from "./pages/DashboardPage";
import ProjectsPage from "./pages/ProjectsPage";
import {
  archiveProject,
  createProject,
  deleteProject,
  listProjects,
  restoreProject,
  updateProject,
} from "./repositories/projectRepository";
import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "./types/project";
import commissioningWorkspaceLogo from "./assets/commissioning-workspace-logo.png";
import "./App.css";

const globalPages = ["Home", "Projects"] as const;
const projectPages = [
  "Overview",
  "Assets",
  "Checklists & Tests",
  "Issues",
  "Documents",
  "Reports",
] as const;
const utilityPages = ["Settings"] as const;

type ProjectPage = (typeof projectPages)[number];
type Page =
  | (typeof globalPages)[number]
  | ProjectPage
  | (typeof utilityPages)[number];
type ProjectStatusAction = "archive" | "restore";

function isProjectPage(page: Page): page is ProjectPage {
  return projectPages.includes(page as ProjectPage);
}

function App() {
  const [activePage, setActivePage] = useState<Page>("Home");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] =
    useState<string | null>(null);
  const [isCreateProjectOpen, setIsCreateProjectOpen] =
    useState(false);
  const [editingProject, setEditingProject] =
    useState<Project | null>(null);
  const [changingProjectStatusId, setChangingProjectStatusId] =
    useState<string | null>(null);
  const [projectStatusActionError, setProjectStatusActionError] =
    useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] =
    useState<Project | null>(null);
  const [isDeletingProject, setIsDeletingProject] =
    useState(false);
  const [projectDeleteError, setProjectDeleteError] =
    useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] =
    useState(true);
  const [projectLoadError, setProjectLoadError] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStoredProjects() {
      try {
        const storedProjects = await listProjects();

        if (!cancelled) {
          setProjects(storedProjects);
        }
      } catch (error) {
        if (!cancelled) {
          setProjectLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load projects.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProjects(false);
        }
      }
    }

    void loadStoredProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  const currentProject =
    projects.find(
      (project) => project.id === currentProjectId,
    ) ?? null;

  async function handleCreateProject(
    input: CreateProjectInput,
  ): Promise<void> {
    const project = await createProject(input);

    setProjects((current) => [project, ...current]);
    setCurrentProjectId(project.id);
    setIsCreateProjectOpen(false);
    setActivePage("Overview");
  }

  async function handleUpdateProject(
    input: UpdateProjectInput,
  ): Promise<void> {
    if (!editingProject) {
      return;
    }

    const updatedProject = await updateProject(
      editingProject.id,
      input,
    );

    setProjects((current) =>
      current.map((project) =>
        project.id === updatedProject.id
          ? updatedProject
          : project,
      ),
    );
    setEditingProject(null);
  }

  function handleOpenProject(projectId: string) {
    setCurrentProjectId(projectId);
    setActivePage("Overview");
  }

  async function handleProjectStatusAction(
    project: Project,
    action: ProjectStatusAction,
  ) {
    if (changingProjectStatusId !== null) {
      return;
    }

    setChangingProjectStatusId(project.id);
    setProjectStatusActionError(null);

    try {
      const updatedProject =
        action === "archive"
          ? await archiveProject(project.id)
          : await restoreProject(project.id);

      setProjects((current) =>
        current.map((currentProject) =>
          currentProject.id === updatedProject.id
            ? updatedProject
            : currentProject,
        ),
      );
    } catch (error) {
      setProjectStatusActionError(
        error instanceof Error
          ? error.message
          : action === "archive"
            ? "Failed to archive the project."
            : "Failed to restore the project.",
      );
    } finally {
      setChangingProjectStatusId(null);
    }
  }

  function handleRequestDeleteProject(project: Project) {
    setProjectDeleteError(null);
    setProjectToDelete(project);
  }

  function handleCloseDeleteProject() {
    if (isDeletingProject) {
      return;
    }

    setProjectToDelete(null);
    setProjectDeleteError(null);
  }

  async function handleConfirmDeleteProject() {
    if (!projectToDelete) {
      return;
    }

    const project = projectToDelete;

    setIsDeletingProject(true);
    setProjectDeleteError(null);

    try {
      await deleteProject(project.id);

      setProjects((current) =>
        current.filter(
          (currentProject) => currentProject.id !== project.id,
        ),
      );

      setEditingProject((current) =>
        current?.id === project.id ? null : current,
      );

      if (currentProjectId === project.id) {
        setCurrentProjectId(null);
        setActivePage("Projects");
      }

      setProjectToDelete(null);
    } catch (error) {
      setProjectDeleteError(
        error instanceof Error
          ? error.message
          : "Failed to delete the project.",
      );
    } finally {
      setIsDeletingProject(false);
    }
  }

  function renderNoProjectSelected(message: string) {
    return (
      <section className="content-card placeholder">
        <h3>No project selected</h3>
        <p>{message}</p>
      </section>
    );
  }

  function handleWindowDrag(
    event: React.MouseEvent<HTMLDivElement>,
  ) {
    if (event.button !== 0) {
      return;
    }
    void getCurrentWindow().startDragging();
  }

  function renderPage() {
    if (isLoadingProjects) {
      return (
        <section className="content-card placeholder">
          <h3>Loading projects</h3>
          <p>
            Reading commissioning projects from the local database.
          </p>
        </section>
      );
    }

    if (projectLoadError) {
      return (
        <section className="content-card placeholder">
          <h3>Unable to load projects</h3>
          <p>{projectLoadError}</p>
        </section>
      );
    }

    switch (activePage) {
      case "Home":
        return (
          <section className="content-card section-card">
            <div className="card-header">
              <div>
                <h3>Workspace</h3>
                <p>
                  Open an existing project or create a new
                  commissioning project.
                </p>
              </div>
            </div>

            <div className="section-body">
              <div className="project-summary">
                <div>
                  <span>Total projects</span>
                  <strong>{projects.length}</strong>
                </div>

                <div>
                  <span>Current project</span>
                  <strong>
                    {currentProject?.name ?? "None selected"}
                  </strong>
                </div>
              </div>
            </div>
          </section>
        );

      case "Projects":
        return (
          <ProjectsPage
            projects={projects}
            currentProjectId={currentProjectId}
            changingProjectStatusId={changingProjectStatusId}
            actionError={projectStatusActionError}
            onCreateProject={() => setIsCreateProjectOpen(true)}
            onSelectProject={handleOpenProject}
            onEditProject={setEditingProject}
            onArchiveProject={(project) => {
              void handleProjectStatusAction(project, "archive");
            }}
            onRestoreProject={(project) => {
              void handleProjectStatusAction(project, "restore");
            }}
            onDeleteProject={handleRequestDeleteProject}
          />
        );

      case "Overview":
        if (!currentProject) {
          return renderNoProjectSelected(
            "Open or create a project before viewing its commissioning overview.",
          );
        }

        return (
          <ProjectOverviewPage
            currentProject={currentProject}
          />
        );

      case "Assets":
        if (!currentProject) {
          return renderNoProjectSelected(
            "Open or create a project before managing assets.",
          );
        }

        return <AssetsPage currentProject={currentProject} />;

      default:
        if (isProjectPage(activePage) && !currentProject) {
          return renderNoProjectSelected(
            "Open or create a project before accessing this project module.",
          );
        }

        return (
          <section className="content-card placeholder">
            <h3>{activePage}</h3>
            <p>
              {isProjectPage(activePage) && currentProject
                ? `${activePage} for ${currentProject.name} will be implemented in a later version.`
                : "This module will be implemented in a later version."}
            </p>
          </section>
        );
    }
  }

  return (
    <>
      <div className="app-shell">
        <div
          className="window-drag-region"
          data-tauri-drag-region
          aria-hidden="true"
          onMouseDown={handleWindowDrag}
        />
        <aside className="sidebar">
          <div className="sidebar-logo" data-tauri-drag-region>
            <img
              src={commissioningWorkspaceLogo}
              alt="Commissioning Workspace"
            />
          </div>

          <div className="sidebar-body">
            <nav className="navigation">
              {globalPages.map((page) => (
                <button
                  key={page}
                  type="button"
                  className={
                    activePage === page
                      ? "nav-item active"
                      : "nav-item"
                  }
                  onClick={() => setActivePage(page)}
                >
                  {page}
                </button>
              ))}
            </nav>

            {currentProject && (
              <section className="project-navigation-section">
                <label
                  className="navigation-label"
                  htmlFor="current-project"
                >
                  Current project
                </label>

                <select
                  id="current-project"
                  className="project-switcher"
                  value={currentProjectId ?? ""}
                  onChange={(event) =>
                    handleOpenProject(event.target.value)
                  }
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>

                <nav className="navigation project-navigation">
                  {projectPages.map((page) => (
                    <button
                      key={page}
                      type="button"
                      className={
                        activePage === page
                          ? "nav-item active"
                          : "nav-item"
                      }
                      onClick={() => setActivePage(page)}
                    >
                      {page}
                    </button>
                  ))}
                </nav>
              </section>
            )}

            <div className="sidebar-spacer" />

            <nav className="navigation utility-navigation">
              {utilityPages.map((page) => (
                <button
                  key={page}
                  type="button"
                  className={
                    activePage === page
                      ? "nav-item active"
                      : "nav-item"
                  }
                  onClick={() => setActivePage(page)}
                >
                  {page}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <main className="main-content">
          <div className="page-content">{renderPage()}</div>
        </main>
      </div>

      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        onCreate={handleCreateProject}
      />

      <EditProjectModal
        project={editingProject}
        onClose={() => setEditingProject(null)}
        onSave={handleUpdateProject}
      />

      <DeleteConfirmationModal
        isOpen={projectToDelete !== null}
        title="Delete project"
        message={
          projectToDelete ? (
            <>
              Delete <strong>{projectToDelete.name}</strong>? All
              assets belonging to this project will also be
              permanently deleted. This action cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete project"
        submittingLabel="Deleting project..."
        isSubmitting={isDeletingProject}
        error={projectDeleteError}
        onClose={handleCloseDeleteProject}
        onConfirm={() => {
          void handleConfirmDeleteProject();
        }}
      />
    </>
  );
}

export default App;