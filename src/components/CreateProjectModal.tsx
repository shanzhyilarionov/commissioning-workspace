import { useState, type FormEvent } from "react";

import type { CreateProjectInput } from "../types/project";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: CreateProjectInput) => Promise<void>;
}

const emptyForm: CreateProjectInput = {
  name: "",
  client: "",
  location: "",
  description: "",
};

function CreateProjectModal({
  isOpen,
  onClose,
  onCreate,
}: CreateProjectModalProps) {
  const [form, setForm] = useState<CreateProjectInput>(emptyForm);
  const [nameError, setNameError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return null;
  }

  function handleClose() {
    if (isSubmitting) {
      return;
    }

    setForm(emptyForm);
    setNameError("");
    setSubmitError("");
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = form.name.trim();

    if (!name) {
      setNameError("Project name is required.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      await onCreate({
        name,
        client: form.client.trim(),
        location: form.location.trim(),
        description: form.description.trim(),
      });

      setForm(emptyForm);
      setNameError("");
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to create the project.",
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
        aria-labelledby="create-project-title"
      >

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <h2
              id="create-project-title"
              className="modal-form-title"
            >
              Create project
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
                placeholder="North Plant Commissioning"
              />

              {nameError && (
                <small className="field-error">{nameError}</small>
              )}
            </label>

            <label className="form-field">
              <span>Client</span>

              <input
                type="text"
                value={form.client}
                disabled={isSubmitting}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    client: event.target.value,
                  }))
                }
                placeholder="Client or organization"
              />
            </label>

            <label className="form-field">
              <span>Location</span>

              <input
                type="text"
                value={form.location}
                disabled={isSubmitting}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    location: event.target.value,
                  }))
                }
                placeholder="Edmonton, Alberta"
              />
            </label>

            <label className="form-field">
              <span>Description</span>

              <textarea
                rows={4}
                value={form.description}
                disabled={isSubmitting}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Optional project description"
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
              {isSubmitting ? "Creating..." : "Create project"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default CreateProjectModal;