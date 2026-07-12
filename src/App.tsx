import { useState } from "react";

import CreateProjectModal from "./components/CreateProjectModal";

import ProjectOverviewPage from "./pages/DashboardPage";
import ProjectsPage from "./pages/ProjectsPage";

import type { CreateProjectInput, Project } from "./types/project";

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

const descriptions: Record<Page, string> = {
  Home: "Overview of your commissioning workspace and recent projects.",
  Projects: "Create, open, and manage commissioning projects.",
  Overview: "Review the current project's commissioning progress and status.",
  Assets: "Manage systems, areas, equipment, tags, and asset status.",
  "Checklists & Tests":
    "Create, execute, and review commissioning checklists and tests.",
  Issues: "Track deficiencies, punch items, failures, and resolutions.",
  Documents: "Manage drawings, procedures, certificates, and project files.",
  Reports: "Generate and export commissioning records and summaries.",
  Settings: "Configure application and workspace preferences.",
};

function isProjectPage(page: Page): page is ProjectPage {
  return projectPages.includes(page as ProjectPage);
}

function App() {
  const [activePage, setActivePage] = useState<Page>("Home");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(
    null,
  );
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);

  const currentProject =
    projects.find((project) => project.id === currentProjectId) ?? null;

  function handleCreateProject(input: CreateProjectInput) {
    const timestamp = new Date().toISOString();

    const project: Project = {
      id: crypto.randomUUID(),
      name: input.name,
      client: input.client,
      location: input.location,
      description: input.description,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setProjects((current) => [project, ...current]);
    setCurrentProjectId(project.id);
    setIsCreateProjectOpen(false);
    setActivePage("Overview");
  }

  function handleOpenProject(projectId: string) {
    setCurrentProjectId(projectId);
    setActivePage("Overview");
  }

  function renderPage() {
    switch (activePage) {
      case "Home":
        return (
          <section className="content-card">
            <div className="card-header">
              <div>
                <h3>Workspace</h3>
                <p>
                  Open an existing project or create a new commissioning
                  project.
                </p>
              </div>

              <button
                className="primary-button"
                type="button"
                onClick={() => setIsCreateProjectOpen(true)}
              >
                New project
              </button>
            </div>

            <div className="project-summary">
              <div>
                <span>Total projects</span>
                <strong>{projects.length}</strong>
              </div>

              <div>
                <span>Current project</span>
                <strong>{currentProject?.name ?? "None selected"}</strong>
              </div>
            </div>
          </section>
        );

      case "Projects":
        return (
          <ProjectsPage
            projects={projects}
            currentProjectId={currentProjectId}
            onCreateProject={() => setIsCreateProjectOpen(true)}
            onSelectProject={handleOpenProject}
          />
        );

      case "Overview":
        if (!currentProject) {
          return (
            <section className="content-card placeholder">
              <h3>No project selected</h3>
              <p>
                Open or create a project before viewing its commissioning
                overview.
              </p>
            </section>
          );
        }

        return (
          <ProjectOverviewPage
            currentProject={currentProject}
            onCreateProject={() => setIsCreateProjectOpen(true)}
          />
        );

      default:
        if (isProjectPage(activePage) && !currentProject) {
          return (
            <section className="content-card placeholder">
              <h3>No project selected</h3>
              <p>
                Open or create a project before accessing this project module.
              </p>
            </section>
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
                    activePage === page ? "nav-item active" : "nav-item"
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
                  onChange={(event) => handleOpenProject(event.target.value)}
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
                        activePage === page ? "nav-item active" : "nav-item"
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
                    activePage === page ? "nav-item active" : "nav-item"
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
          <header className="page-header">
            <div>
              <h2>{activePage}</h2>
              <p>{descriptions[activePage]}</p>
            </div>

            {isProjectPage(activePage) && currentProject && (
              <div className="page-project-context">
                <span>Project</span>
                <strong>{currentProject.name}</strong>
              </div>
            )}
          </header>

          <div className="page-content">{renderPage()}</div>
        </main>
      </div>

      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        onCreate={handleCreateProject}
      />
    </>
  );
}

export default App;