import { useEffect, useState } from "react";
import type { Project } from "../types/project";

interface ProjectExportModalProps {
  isOpen: boolean;
  projects: Project[];
  isExporting: boolean;
  error: string | null;
  onClose: () => void;
  onExport: (projectIds: string[]) => void;
}

function ProjectExportModal({
  isOpen,
  projects,
  isExporting,
  error,
  onClose,
  onExport,
}: ProjectExportModalProps) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedProjectIds(new Set(projects.map((project) => project.id)));
    }
  }, [isOpen, projects]);

  if (!isOpen) {
    return null;
  }

  const allSelected =
    projects.length > 0 && selectedProjectIds.size === projects.length;

  function toggleProject(projectId: string) {
    if (isExporting) {
      return;
    }
    setSelectedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }

  function toggleAllProjects() {
    if (isExporting) {
      return;
    }
    setSelectedProjectIds(
      allSelected ? new Set() : new Set(projects.map((project) => project.id)),
    );
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal project-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-export-title"
      >
        <div className="project-export-modal-header">
          <div>
            <h2 id="project-export-title" className="modal-form-title">
              Export projects
            </h2>
            <p>Select the projects to include in the project package.</p>
          </div>
          <button
            type="button"
            className="secondary-button project-export-select-all"
            disabled={isExporting || projects.length === 0}
            onClick={toggleAllProjects}
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>

        <div className="project-export-list">
          {projects.length === 0 ? (
            <p className="project-export-empty">No projects are available.</p>
          ) : (
            projects.map((project) => (
              <label key={project.id} className="project-export-option">
                <input
                  type="checkbox"
                  checked={selectedProjectIds.has(project.id)}
                  disabled={isExporting}
                  onChange={() => toggleProject(project.id)}
                />
                <span>
                  <strong>{project.name}</strong>
                  <small>
                    {[project.client, project.location]
                      .filter(Boolean)
                      .join(" · ") || "No client or location"}
                  </small>
                </span>
              </label>
            ))
          )}
        </div>

        {error && (
          <p className="form-submit-error project-export-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="secondary-button"
            disabled={isExporting}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={isExporting || selectedProjectIds.size === 0}
            onClick={() => onExport(Array.from(selectedProjectIds))}
          >
            {isExporting
              ? "Exporting..."
              : `Export ${selectedProjectIds.size || ""} ${
                  selectedProjectIds.size === 1 ? "project" : "projects"
                }`}
          </button>
        </div>
      </section>
    </div>
  );
}

export default ProjectExportModal;
