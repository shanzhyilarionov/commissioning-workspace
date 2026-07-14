import type { Project } from "../types/project";

interface ProjectOverviewPageProps {
  currentProject: Project;
}

function formatProjectStatus(status: Project["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function ProjectOverviewPage({
  currentProject,
}: ProjectOverviewPageProps) {
  return (
    <section className="content-card section-card">
      <div className="card-header">
        <div>
          <h3>Project overview</h3>

          <p>
            Current project: {currentProject.name}
          </p>
        </div>
      </div>

      <div className="section-body">
        <div className="project-detail-grid">
          <div className="project-detail">
            <span>Project name</span>
            <strong>{currentProject.name}</strong>
          </div>

          <div className="project-detail">
            <span>Client</span>
            <strong>{currentProject.client || "—"}</strong>
          </div>

          <div className="project-detail">
            <span>Location</span>
            <strong>{currentProject.location || "—"}</strong>
          </div>

          <div className="project-detail">
            <span>Status</span>
            <strong
              className={`status-badge ${currentProject.status}`}
            >
              {formatProjectStatus(currentProject.status)}
            </strong>
          </div>

          <div className="project-detail">
            <span>Created</span>
            <strong>
              {new Date(currentProject.createdAt).toLocaleDateString(
                "en-CA",
              )}
            </strong>
          </div>

          <div className="project-detail">
            <span>Updated</span>
            <strong>
              {new Date(currentProject.updatedAt).toLocaleDateString(
                "en-CA",
              )}
            </strong>
          </div>
        </div>

        <div className="project-details">
          <div className="project-detail">
            <span>Description</span>
            <strong>
              {currentProject.description || "No description."}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ProjectOverviewPage;