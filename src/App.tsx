import { useEffect, useState } from "react";

import CreateProjectModal from "./components/CreateProjectModal";
import EditProjectModal from "./components/EditProjectModal";
import ProjectStatusActionModal, {
  type ProjectStatusAction,
} from "./components/ProjectStatusActionModal";
import AssetsPage from "./pages/AssetsPage";
import ProjectOverviewPage from "./pages/DashboardPage";
import ProjectsPage from "./pages/ProjectsPage";
import {
  archiveProject,
  createProject,
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

interface PendingProjectStatusAction {
  project: Project;
  action: ProjectStatusAction;
}

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

  const [
    pendingProjectStatusAction,
    setPendingProjectStatusAction,
  ] = useState<PendingProjectStatusAction | null>(null);

  const [
    isChangingProjectStatus,
    setIsChangingProjectStatus,
  ] = useState(false);

  const [
    projectStatusActionError,
    setProjectStatusActionError,
  ] = useState<string | null>(null);

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

  const changingProjectStatusId =
    isChangingProjectStatus &&
    pendingProjectStatusAction
      ? pendingProjectStatusAction.project.id
      : null;

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

  function handleRequestProjectStatusAction(
    project: Project,
    action: ProjectStatusAction,
  ) {
    setProjectStatusActionError(null);

    setPendingProjectStatusAction({
      project,
      action,
    });
  }

  function handleCloseProjectStatusAction() {
    if (isChangingProjectStatus) {
      return;
    }

    setPendingProjectStatusAction(null);
    setProjectStatusActionError(null);
  }

  async function handleConfirmProjectStatusAction() {
    if (!pendingProjectStatusAction) {
      return;
    }

    const { project, action } =
      pendingProjectStatusAction;

    setIsChangingProjectStatus(true);
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

      setPendingProjectStatusAction(null);
    } catch (error) {
      setProjectStatusActionError(
        error instanceof Error
          ? error.message
          : action === "archive"
            ? "Failed to archive the project."
            : "Failed to restore the project.",
      );
    } finally {
      setIsChangingProjectStatus(false);
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

  function renderPage() {
    if (isLoadingProjects) {
      return (
        <section className="content-card placeholder">
          <h3>Loading projects</h3>

          <p>
            Reading commissioning projects from the local
            database.
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

              <button
                className="primary-button"
                type="button"
                onClick={() =>
                  setIsCreateProjectOpen(true)
                }
              >
                New project
              </button>
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
                    {currentProject?.name ??
                      "None selected"}
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
            changingProjectStatusId={
              changingProjectStatusId
            }
            onCreateProject={() =>
              setIsCreateProjectOpen(true)
            }
            onSelectProject={handleOpenProject}
            onEditProject={setEditingProject}
            onArchiveProject={(project) =>
              handleRequestProjectStatusAction(
                project,
                "archive",
              )
            }
            onRestoreProject={(project) =>
              handleRequestProjectStatusAction(
                project,
                "restore",
              )
            }
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
            onCreateProject={() =>
              setIsCreateProjectOpen(true)
            }
          />
        );

      case "Assets":
        if (!currentProject) {
          return renderNoProjectSelected(
            "Open or create a project before managing assets.",
          );
        }

        return (
          <AssetsPage currentProject={currentProject} />
        );

      default:
        if (
          isProjectPage(activePage) &&
          !currentProject
        ) {
          return renderNoProjectSelected(
            "Open or create a project before accessing this project module.",
          );
        }

        return (
          <section className="content-card placeholder">
            <h3>{activePage}</h3>

            <p>
              {isProjectPage(activePage) &&
              currentProject
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
        <aside className="sidebar">
          <div className="sidebar-logo">
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
                    <option
                      key={project.id}
                      value={project.id}
                    >
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
          <div className="page-content">
            {renderPage()}
          </div>
        </main>
      </div>

      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() =>
          setIsCreateProjectOpen(false)
        }
        onCreate={handleCreateProject}
      />

      <EditProjectModal
        project={editingProject}
        onClose={() => setEditingProject(null)}
        onSave={handleUpdateProject}
      />

      <ProjectStatusActionModal
        project={
          pendingProjectStatusAction?.project ?? null
        }
        action={
          pendingProjectStatusAction?.action ?? null
        }
        isSubmitting={isChangingProjectStatus}
        error={projectStatusActionError}
        onClose={handleCloseProjectStatusAction}
        onConfirm={() => {
          void handleConfirmProjectStatusAction();
        }}
      />
    </>
  );
}

export default App;