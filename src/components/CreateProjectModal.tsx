import { useState, type FormEvent } from "react";

import type { CreateProjectInput } from "../types/project";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: CreateProjectInput) => void;
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

  if (!isOpen) {
    return null;
  }

  function handleClose() {
    setForm(emptyForm);
    setNameError("");
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = form.name.trim();

    if (!name) {
      setNameError("Project name is required.");
      return;
    }

    onCreate({
      name,
      client: form.client.trim(),
      location: form.location.trim(),
      description: form.description.trim(),
    });

    setForm(emptyForm);
    setNameError("");
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
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="create-project-title">Create project</h2>
            <p>Add the basic information for a commissioning project.</p>
          </div>

          <button
            className="modal-close-button"
            type="button"
            aria-label="Close"
            onClick={handleClose}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label className="form-field">
              <span>
                Project name <strong>*</strong>
              </span>

              <input
                autoFocus
                type="text"
                value={form.name}
                className={nameError ? "input-error" : ""}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }));

                  if (nameError) {
                    setNameError("");
                  }
                }}
                placeholder="North Plant Commissioning"
              />

              {nameError && <small className="field-error">{nameError}</small>}
            </label>

            <label className="form-field">
              <span>Client</span>

              <input
                type="text"
                value={form.client}
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
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Optional project description"
              />
            </label>
          </div>

          <div className="modal-footer">
            <button
              className="secondary-button"
              type="button"
              onClick={handleClose}
            >
              Cancel
            </button>

            <button className="primary-button" type="submit">
              Create project
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default CreateProjectModal;