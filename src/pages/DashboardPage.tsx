import type { Project } from "../types/project";

interface DashboardPageProps {
  currentProject: Project | null;
  onCreateProject: () => void;
}

const metrics = [
  { label: "Total Equipment", value: "0" },
  { label: "Completed", value: "0" },
  { label: "Open Issues", value: "0" },
  { label: "Progress", value: "0%" },
];

function DashboardPage({
  currentProject,
  onCreateProject,
}: DashboardPageProps) {
  return (
    <>
      <section className="metrics-grid">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="content-card">
        <div className="card-header">
          <div>
            <h3>Project overview</h3>

            <p>
              {currentProject
                ? `Current project: ${currentProject.name}`
                : "No commissioning project has been created."}
            </p>
          </div>

          <button
            className="primary-button"
            type="button"
            onClick={onCreateProject}
          >
            Create project
          </button>
        </div>

        {currentProject ? (
          <div className="project-summary">
            <div>
              <span>Project name</span>
              <strong>{currentProject.name}</strong>
            </div>

            <div>
              <span>Client</span>
              <strong>{currentProject.client || "Not specified"}</strong>
            </div>

            <div>
              <span>Location</span>
              <strong>{currentProject.location || "Not specified"}</strong>
            </div>

            <div>
              <span>Status</span>
              <strong className="status-badge">
                {currentProject.status}
              </strong>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">+</div>

            <h3>Start your first project</h3>

            <p>
              Create a project before adding areas, equipment, checklists, test
              records, and punch-list items.
            </p>
          </div>
        )}
      </section>
    </>
  );
}

export default DashboardPage;