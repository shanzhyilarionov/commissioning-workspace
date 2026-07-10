import { useState } from "react";

import CreateProjectModal from "./components/CreateProjectModal";
import DashboardPage from "./pages/DashboardPage";
import ProjectsPage from "./pages/ProjectsPage";

import type { CreateProjectInput, Project } from "./types/project";

import "./App.css";

const pages = [
  "Dashboard",
  "Projects",
  "Equipment",
  "Checklists",
  "Issues",
  "Reports",
  "Settings",
] as const;

type Page = (typeof pages)[number];

const descriptions: Record<Page, string> = {
  Dashboard: "Overview of commissioning progress and project status.",
  Projects: "Create and manage commissioning projects.",
  Equipment: "Manage equipment, tags, systems, areas, and status.",
  Checklists: "Complete and review equipment commissioning checklists.",
  Issues: "Track punch-list items, failures, and resolutions.",
  Reports: "Review and export commissioning records.",
  Settings: "Configure application and project preferences.",
};

function App() {
  const [activePage, setActivePage] = useState<Page>("Dashboard");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
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
    setActivePage("Projects");
  }

  function renderPage() {
    switch (activePage) {
      case "Dashboard":
        return (
          <DashboardPage
            currentProject={currentProject}
            onCreateProject={() => setIsCreateProjectOpen(true)}
          />
        );

      case "Projects":
        return (
          <ProjectsPage
            projects={projects}
            currentProjectId={currentProjectId}
            onCreateProject={() => setIsCreateProjectOpen(true)}
            onSelectProject={setCurrentProjectId}
          />
        );

      default:
        return (
          <section className="content-card placeholder">
            <h3>{activePage}</h3>
            <p>This module will be implemented in a later version.</p>
          </section>
        );
    }
  }

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <nav className="navigation">
            {pages.map((page) => (
              <button
                key={page}
                type="button"
                className={activePage === page ? "nav-item active" : "nav-item"}
                onClick={() => setActivePage(page)}
              >
                {page}
              </button>
            ))}
          </nav>
        </aside>

        <main className="main-content">
          <header className="page-header">
            <div>
              <h2>{activePage}</h2>
              <p>{descriptions[activePage]}</p>
            </div>

            <div className="project-selector">
              <span>Current project</span>
              <strong>
                {currentProject?.name ?? "No project selected"}
              </strong>
            </div>
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