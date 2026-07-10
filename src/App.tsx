import { useState } from "react";
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

const metrics = [
  { label: "Total Equipment", value: "0" },
  { label: "Completed", value: "0" },
  { label: "Open Issues", value: "0" },
  { label: "Progress", value: "0%" },
];

function App() {
  const [activePage, setActivePage] = useState<Page>("Dashboard");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">CS</div>

          <div>
            <h1>Commissioning Studio</h1>
            <p>Industrial commissioning workspace</p>
          </div>
        </div>

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

        <footer className="sidebar-footer">
          <span>Version 0.1.0</span>
          <span>Local workspace</span>
        </footer>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">Commissioning Studio</p>
            <h2>{activePage}</h2>
            <p>{descriptions[activePage]}</p>
          </div>

          <div className="project-selector">
            <span>Current project</span>
            <strong>No project selected</strong>
          </div>
        </header>

        <div className="page-content">
          {activePage === "Dashboard" ? (
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
                    <p>No commissioning project has been created.</p>
                  </div>

                  <button className="primary-button" type="button">
                    Create project
                  </button>
                </div>

                <div className="empty-state">
                  <div className="empty-icon">+</div>
                  <h3>Start your first project</h3>
                  <p>
                    Create a project before adding areas, equipment, checklists,
                    test records, and punch-list items.
                  </p>
                </div>
              </section>
            </>
          ) : (
            <section className="content-card placeholder">
              <h3>{activePage}</h3>
              <p>This module will be implemented in a later version.</p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;