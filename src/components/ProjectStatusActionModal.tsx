import type { Project } from "../types/project";

export type ProjectStatusAction = "archive" | "restore";

interface ProjectStatusActionModalProps {
  project: Project | null;
  action: ProjectStatusAction | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

function ProjectStatusActionModal({
  project,
  action,
  isSubmitting,
  error,
  onClose,
  onConfirm,
}: ProjectStatusActionModalProps) {
  if (!project || !action) {
    return null;
  }

  const isArchive = action === "archive";

  function handleClose() {
    if (!isSubmitting) {
      onClose();
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <section
        className="modal modal-small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-status-action-title"
      >
        <div className="modal-body">
          <h2
            id="project-status-action-title"
            className="modal-form-title"
          >
            {isArchive ? "Archive project" : "Restore project"}
          </h2>
          <p className="modal-message">
            {isArchive ? (
              <>
                Archive <strong>{project.name}</strong>? The project
                will remain in the database and can be restored later.
              </>
            ) : (
              <>
                Restore <strong>{project.name}</strong>? Its status
                will return to Active.
              </>
            )}
          </p>

          {error && (
            <p className="form-submit-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="secondary-button"
            type="button"
            disabled={isSubmitting}
            onClick={handleClose}
          >
            Cancel
          </button>

          <button
            className={
              isArchive ? "danger-button" : "primary-button"
            }
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
          >
            {isSubmitting
              ? isArchive
                ? "Archiving..."
                : "Restoring..."
              : isArchive
                ? "Archive project"
                : "Restore project"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default ProjectStatusActionModal;