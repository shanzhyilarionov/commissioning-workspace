import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AttentionFocusManager, {
  type AttentionDestinationPage,
  type AttentionNavigationRequest,
} from "./components/AttentionFocusManager";
import CreateProjectModal from "./components/CreateProjectModal";
import DeleteConfirmationModal from "./components/DeleteConfirmationModal";
import EditProjectModal from "./components/EditProjectModal";
import AssetsPage from "./pages/AssetsPage";
import ChecklistsTestsPage from "./pages/ChecklistsTestsPage";
import ProjectOverviewPage from "./pages/DashboardPage";
import IssuesPage from "./pages/IssuesPage";
import DocumentsPage from "./pages/DocumentsPage";
import HomePage from "./pages/HomePage";
import ProjectsPage from "./pages/ProjectsPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import { getCurrentOperator } from "./repositories/auditRepository";
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
import type { ProjectNavigationItem } from "./types/navigation";
import {
  getStoredTheme,
  saveTheme,
  type AppTheme,
  watchSystemTheme,
} from "./theme";
import {
  clearContinueWorkingLocation,
  continueWorkingPages,
  loadContinueWorkingLocation,
  saveContinueWorkingLocation,
  type ContinueWorkingItem,
} from "./services/continueWorkingService";
import {
  getAutomaticBackupPreferences,
  runAutomaticWorkspaceBackup,
} from "./services/workspaceBackupService";
import commissioningWorkspaceLogo from "./assets/commissioning-workspace-logo.png";
import "./theme.css";
import "./App.css";

const globalPages = ["Home", "Projects"] as const;
const projectPages = continueWorkingPages;
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
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());
  const [activePage, setActivePage] = useState<Page>("Home");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentOperatorName, setCurrentOperatorName] = useState("");
  const [continueWorkingLocation, setContinueWorkingLocation] =
    useState(loadContinueWorkingLocation);
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

  useEffect(() => watchSystemTheme(theme), [theme]);
  const [projectDeleteError, setProjectDeleteError] =
    useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] =
    useState(true);
  const [projectLoadError, setProjectLoadError] =
    useState<string | null>(null);
  const [attentionNavigation, setAttentionNavigation] =
    useState<AttentionNavigationRequest | null>(null);
  const attentionRequestSequence = useRef(0);
  const automaticBackupStarted = useRef(false);

  useEffect(() => {
    if (automaticBackupStarted.current) {
      return;
    }
    automaticBackupStarted.current = true;

    const preferences = getAutomaticBackupPreferences();
    if (preferences.enabled) {
      void runAutomaticWorkspaceBackup(preferences).catch(() => undefined);
    }
  }, []);

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

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentOperator() {
      try {
        const operatorName = await getCurrentOperator();

        if (!cancelled) {
          setCurrentOperatorName(operatorName);
        }
      } catch {
        if (!cancelled) {
          setCurrentOperatorName("");
        }
      }
    }

    void loadCurrentOperator();

    return () => {
      cancelled = true;
    };
  }, []);

  const currentProject =
    projects.find(
      (project) => project.id === currentProjectId,
    ) ?? null;
  const hasProjects = projects.length > 0;
  const continueWorkingProject = continueWorkingLocation
    ? projects.find(
        (project) => project.id === continueWorkingLocation.projectId,
      ) ?? null
    : null;
  const fallbackContinueWorkingProject =
    projects.find((project) => project.status === "active") ??
    projects[0] ??
    null;
  const continueWorkingItem: ContinueWorkingItem | null =
    continueWorkingLocation && continueWorkingProject
      ? {
          ...continueWorkingLocation,
          projectName: continueWorkingProject.name,
          isFallback: false,
        }
      : fallbackContinueWorkingProject
        ? {
            projectId: fallbackContinueWorkingProject.id,
            projectName: fallbackContinueWorkingProject.name,
            page: "Overview",
            visitedAt: fallbackContinueWorkingProject.updatedAt,
            isFallback: true,
          }
        : null;

  useEffect(() => {
    if (
      !currentProject ||
      !currentProjectId ||
      !isProjectPage(activePage)
    ) {
      return;
    }

    const location = {
      projectId: currentProjectId,
      page: activePage,
      visitedAt: new Date().toISOString(),
    };

    saveContinueWorkingLocation(location);
    setContinueWorkingLocation(location);
  }, [activePage, currentProject?.id, currentProjectId]);

  useEffect(() => {
    if (
      isLoadingProjects ||
      !continueWorkingLocation ||
      continueWorkingProject
    ) {
      return;
    }

    clearContinueWorkingLocation();
    setContinueWorkingLocation(null);
  }, [
    continueWorkingLocation,
    continueWorkingProject,
    isLoadingProjects,
  ]);

  useEffect(() => {
    if (
      !isLoadingProjects &&
      !projectLoadError &&
      !hasProjects &&
      (activePage === "Projects" || isProjectPage(activePage))
    ) {
      setCurrentProjectId(null);
      setAttentionNavigation(null);
      setActivePage("Home");
    }
  }, [activePage, hasProjects, isLoadingProjects, projectLoadError]);

  function handleNavigation(page: Page) {
    setAttentionNavigation(null);
    setActivePage(page);
  }

  function handleOverviewNavigation(
    page: AttentionDestinationPage,
    item?: ProjectNavigationItem,
  ) {
    if (item) {
      attentionRequestSequence.current += 1;
      setAttentionNavigation({
        requestId: attentionRequestSequence.current,
        page,
        item,
      });
    } else {
      setAttentionNavigation(null);
    }

    setActivePage(page);
  }

  const handleAttentionFocusComplete = useCallback(
    (requestId: number) => {
      setAttentionNavigation((current) =>
        current?.requestId === requestId ? null : current,
      );
    },
    [],
  );

  async function handleCreateProject(
    input: CreateProjectInput,
  ): Promise<void> {
    const project = await createProject(input);

    setProjects((current) => [project, ...current]);
    setCurrentProjectId(project.id);
    setIsCreateProjectOpen(false);
    setAttentionNavigation(null);
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
    setAttentionNavigation(null);
    setCurrentProjectId(projectId);
    setActivePage("Overview");
  }

  function handleContinueWorking() {
    if (!continueWorkingItem) {
      return;
    }

    const projectExists = projects.some(
      (project) => project.id === continueWorkingItem.projectId,
    );

    if (!projectExists) {
      clearContinueWorkingLocation();
      setContinueWorkingLocation(null);
      return;
    }

    setAttentionNavigation(null);
    setCurrentProjectId(continueWorkingItem.projectId);
    setActivePage(continueWorkingItem.page);
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

      const remainingProjects = projects.filter(
        (currentProject) => currentProject.id !== project.id,
      );

      setProjects(remainingProjects);

      if (continueWorkingLocation?.projectId === project.id) {
        clearContinueWorkingLocation();
        setContinueWorkingLocation(null);
      }

      setEditingProject((current) =>
        current?.id === project.id ? null : current,
      );

      if (remainingProjects.length === 0) {
        setCurrentProjectId(null);
        setAttentionNavigation(null);
        setActivePage("Home");
      } else if (currentProjectId === project.id) {
        setCurrentProjectId(null);
        setAttentionNavigation(null);
        setActivePage("Projects");
      }

      setProjectToDelete(null);
    } catch (error) {
      setProjectDeleteError(
        error instanceof Error
          ? error.message
          : String(error || "Failed to delete the project."),
      );
    } finally {
      setIsDeletingProject(false);
    }
  }

  async function handleProjectsImported() {
    const storedProjects = await listProjects();
    setProjects(storedProjects);
    setProjectLoadError(null);
    setIsLoadingProjects(false);
  }

  function handleThemeChange(nextTheme: AppTheme) {
    saveTheme(nextTheme);
    setTheme(nextTheme);
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
    if (activePage === "Settings") {
      return (
        <SettingsPage
          projects={projects}
          theme={theme}
          onOperatorNameChange={setCurrentOperatorName}
          onProjectsImported={handleProjectsImported}
          onThemeChange={handleThemeChange}
        />
      );
    }

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

    if (!hasProjects) {
      return (
        <section
          className="first-project-welcome"
          aria-labelledby="first-project-welcome-title"
        >
          <div className="first-project-welcome-copy">
            <h2 id="first-project-welcome-title">Welcome!</h2>
            <h3>To begin with, create your first project.</h3>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => setIsCreateProjectOpen(true)}
          >
            Create project
          </button>
        </section>
      );
    }

    switch (activePage) {
      case "Home":
        return (
          <HomePage
            currentOperatorName={currentOperatorName}
            continueWorkingItem={continueWorkingItem}
            onContinueWorking={handleContinueWorking}
          />
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
            onNavigate={handleOverviewNavigation}
            onEditProject={() => setEditingProject(currentProject)}
          />
        );

      case "Assets":
        if (!currentProject) {
          return renderNoProjectSelected(
            "Open or create a project before managing assets.",
          );
        }

        return (
          <AssetsPage
            currentProject={currentProject}
            attentionItem={
              attentionNavigation?.page === "Assets"
                ? attentionNavigation.item
                : null
            }
            onNavigate={handleOverviewNavigation}
          />
        );

      case "Checklists & Tests":
        if (!currentProject) {
          return renderNoProjectSelected(
            "Open or create a project before managing checklists and tests.",
          );
        }

        return (
          <ChecklistsTestsPage
            currentProject={currentProject}
          />
        );

      case "Issues":
        if (!currentProject) {
          return renderNoProjectSelected(
            "Open or create a project before managing issues.",
          );
        }

        return <IssuesPage currentProject={currentProject} />;

      case "Documents":
        if (!currentProject) {
          return renderNoProjectSelected(
            "Open or create a project before managing documents.",
          );
        }

        return <DocumentsPage currentProject={currentProject} />;
      case "Record reports":
        if (!currentProject) {
          return renderNoProjectSelected(
            "Open or create a project before generating reports.",
          );
        }

        return (
          <ReportsPage
            key="record-reports"
            currentProject={currentProject}
            view="records"
          />
        );

      case "Turnover packages":
        if (!currentProject) {
          return renderNoProjectSelected(
            "Open or create a project before managing turnover packages.",
          );
        }

        return (
          <ReportsPage
            key="turnover-packages"
            currentProject={currentProject}
            view="turnover"
            navigationItem={
              attentionNavigation?.page === "Turnover packages"
                ? attentionNavigation.item
                : null
            }
          />
        );

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
              {globalPages
                .filter(
                  (page) => page !== "Projects" || hasProjects,
                )
                .map((page) => (
                  <button
                    key={page}
                    type="button"
                    className={
                      activePage === page
                        ? "nav-item active"
                        : "nav-item"
                    }
                    onClick={() => handleNavigation(page)}
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
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
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
                      onClick={() => handleNavigation(page)}
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
                  onClick={() => handleNavigation(page)}
                >
                  {page}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <main className="main-content">
          <div className="page-content">{renderPage()}</div>
          <AttentionFocusManager
            activePage={activePage}
            target={attentionNavigation}
            onComplete={handleAttentionFocusComplete}
          />
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
