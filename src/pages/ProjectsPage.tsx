import type { Project } from "../types/project";

interface ProjectsPageProps {
  projects: Project[];
  currentProjectId: string | null;
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
}

function ProjectsPage({
  projects,
  currentProjectId,
  onCreateProject,
  onSelectProject,
}: ProjectsPageProps) {
  return (
    <section className="content-card projects-card">
      <div className="projects-header">
        <div>
          <h3>Projects</h3>
          <p>Create, open, and manage commissioning projects.</p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={onCreateProject}
        >
          New project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">+</div>
          <h3>No projects yet</h3>
          <p>Create your first commissioning project to get started.</p>
        </div>
      ) : (
        <div className="projects-table-wrapper">
          <table className="projects-table">
            <thead>
              <tr>
                <th>Project name</th>
                <th>Client</th>
                <th>Location</th>
                <th>Status</th>
                <th>Updated</th>
                <th aria-label="Actions" />
              </tr>
            </thead>

            <tbody>
              {projects.map((project) => {
                const isCurrentProject = project.id === currentProjectId;

                return (
                  <tr
                    className={isCurrentProject ? "current-project-row" : ""}
                    key={project.id}
                  >
                    <td>
                      <strong>{project.name}</strong>

                      {isCurrentProject && (
                        <span className="current-label">Current</span>
                      )}
                    </td>

                    <td>{project.client || "—"}</td>
                    <td>{project.location || "—"}</td>

                    <td>
                      <span className="status-badge">{project.status}</span>
                    </td>

                    <td>
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </td>

                    <td className="table-action-cell">
                      <button
                        className="row-action-button"
                        type="button"
                        disabled={isCurrentProject}
                        onClick={() => onSelectProject(project.id)}
                      >
                        {isCurrentProject ? "Opened" : "Open"}
                      </button>
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