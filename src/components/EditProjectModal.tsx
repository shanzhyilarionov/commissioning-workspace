import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import type {
  Project,
  UpdateProjectInput,
} from "../types/project";

interface EditProjectModalProps {
  project: Project | null;
  onClose: () => void;
  onSave: (input: UpdateProjectInput) => Promise<void>;
}

const emptyForm: UpdateProjectInput = {
  name: "",
  client: "",
  location: "",
  description: "",
  status: "active",
};

function EditProjectModal({
  project,
  onClose,
  onSave,
}: EditProjectModalProps) {
  const [form, setForm] =
    useState<UpdateProjectInput>(emptyForm);

  const [nameError, setNameError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!project) {
      return;
    }

    setForm({
      name: project.name,
      client: project.client,
      location: project.location,
      description: project.description,
      status: project.status,
    });

    setNameError("");
    setSubmitError("");
  }, [project]);

  if (!project) {
    return null;
  }

  function handleClose() {
    if (isSubmitting) {
      return;
    }

    setNameError("");
    setSubmitError("");
    onClose();
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const name = form.name.trim();

    if (!name) {
      setNameError("Project name is required.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      await onSave({
        name,
        client: form.client.trim(),
        location: form.location.trim(),
        description: form.description.trim(),
        status: form.status,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to update the project.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-project-title"
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <h2
              id="edit-project-title"
              className="modal-form-title"
            >
              Edit project
            </h2>
            <label className="form-field">
              <span>
                Project name <strong>*</strong>
              </span>

              <input
                autoFocus
                type="text"
                value={form.name}
                className={nameError ? "input-error" : ""}
                disabled={isSubmitting}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }));

                  if (nameError) {
                    setNameError("");
                  }

                  if (submitError) {
                    setSubmitError("");
                  }
                }}
              />

              {nameError && (
                <small className="field-error">
                  {nameError}
                </small>
              )}
            </label>

            <label className="form-field">
              <span>Client</span>

              <input
                type="text"
                value={form.client}
                disabled={isSubmitting}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    client: event.target.value,
                  }));

                  if (submitError) {
                    setSubmitError("");
                  }
                }}
              />
            </label>

            <label className="form-field">
              <span>Location</span>

              <input
                type="text"
                value={form.location}
                disabled={isSubmitting}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    location: event.target.value,
                  }));

                  if (submitError) {
                    setSubmitError("");
                  }
                }}
              />
            </label>

            <label className="form-field">
              <span>Status</span>

              <select
                value={form.status}
                disabled={isSubmitting}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    status:
                      event.target
                        .value as UpdateProjectInput["status"],
                  }));

                  if (submitError) {
                    setSubmitError("");
                  }
                }}
              >
                <option value="active">Active</option>
                <option value="completed">
                  Completed
                </option>
                <option value="archived">
                  Archived
                </option>
              </select>
            </label>

            <label className="form-field">
              <span>Description</span>

              <textarea
                rows={4}
                value={form.description}
                disabled={isSubmitting}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }));

                  if (submitError) {
                    setSubmitError("");
                  }
                }}
              />
            </label>

            {submitError && (
              <p className="form-submit-error" role="alert">
                {submitError}
              </p>
            )}
          </div>

          <div className="modal-footer">
            <button
              className="secondary-button"
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>

            <button
              className="primary-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Saving..."
                : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default EditProjectModal;