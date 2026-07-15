import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import type { Asset } from "../types/asset";
import type {
  Issue,
  IssueInput,
  IssuePriority,
  IssueStatus,
} from "../types/issue";

interface IssueModalProps {
  isOpen: boolean;
  assets: Asset[];
  issue: Issue | null;
  onClose: () => void;
  onSave: (input: IssueInput) => Promise<void>;
}

function createEmptyForm(): IssueInput {
  return {
    assetId: null,
    title: "",
    description: "",
    priority: "medium",
    status: "open",
    owner: "",
    dueDate: null,
  };
}

function IssueModal({
  isOpen,
  assets,
  issue,
  onClose,
  onSave,
}: IssueModalProps) {
  const [form, setForm] = useState<IssueInput>(
    createEmptyForm,
  );

  const [titleError, setTitleError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] =
    useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (issue) {
      setForm({
        assetId: issue.assetId,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        status: issue.status,
        owner: issue.owner,
        dueDate: issue.dueDate,
      });
    } else {
      setForm(createEmptyForm());
    }

    setTitleError("");
    setSubmitError("");
    setIsSubmitting(false);
  }, [isOpen, issue]);

  if (!isOpen) {
    return null;
  }

  const isEditing = issue !== null;

  function handleClose() {
    if (isSubmitting) {
      return;
    }

    onClose();
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const title = form.title.trim();

    if (!title) {
      setTitleError("Issue title is required.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      await onSave({
        assetId: form.assetId,
        title,
        description: form.description.trim(),
        priority: form.priority,
        status: form.status,
        owner: form.owner.trim(),
        dueDate: form.dueDate,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to save the issue.",
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
        aria-labelledby="issue-modal-title"
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <h2
              id="issue-modal-title"
              className="modal-form-title"
            >
              {isEditing ? "Edit issue" : "Create issue"}
            </h2>

            <label className="form-field">
              <span>
                Title <strong>*</strong>
              </span>

              <input
                autoFocus
                type="text"
                value={form.title}
                className={
                  titleError ? "input-error" : ""
                }
                disabled={isSubmitting}
                placeholder="Describe the commissioning issue"
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }));

                  if (titleError) {
                    setTitleError("");
                  }

                  if (submitError) {
                    setSubmitError("");
                  }
                }}
              />

              {titleError && (
                <small className="field-error">
                  {titleError}
                </small>
              )}
            </label>

            <div className="asset-form-row">
              <label className="form-field">
                <span>Asset</span>

                <select
                  value={form.assetId ?? ""}
                  disabled={isSubmitting}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      assetId:
                        event.target.value || null,
                    }))
                  }
                >
                  <option value="">
                    No linked asset
                  </option>

                  {assets.map((asset) => (
                    <option
                      key={asset.id}
                      value={asset.id}
                    >
                      {asset.tag} — {asset.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Priority</span>

                <select
                  value={form.priority}
                  disabled={isSubmitting}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority:
                        event.target
                          .value as IssuePriority,
                    }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">
                    Medium
                  </option>
                  <option value="high">High</option>
                  <option value="critical">
                    Critical
                  </option>
                </select>
              </label>
            </div>

            <div className="asset-form-row">
              <label className="form-field">
                <span>Status</span>

                <select
                  value={form.status}
                  disabled={isSubmitting}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status:
                        event.target
                          .value as IssueStatus,
                    }))
                  }
                >
                  <option value="open">Open</option>
                  <option value="in_progress">
                    In progress
                  </option>
                  <option value="resolved">
                    Resolved
                  </option>
                  <option value="closed">
                    Closed
                  </option>
                </select>
              </label>

              <label className="form-field">
                <span>Owner</span>

                <input
                  type="text"
                  value={form.owner}
                  disabled={isSubmitting}
                  placeholder="Responsible person or team"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      owner: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label className="form-field">
              <span>Due date</span>

              <input
                type="date"
                value={form.dueDate ?? ""}
                disabled={isSubmitting}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dueDate:
                      event.target.value || null,
                  }))
                }
              />
            </label>

            <label className="form-field">
              <span>Description</span>

              <textarea
                rows={4}
                value={form.description}
                disabled={isSubmitting}
                placeholder="Add details, observations, or required corrective work"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description:
                      event.target.value,
                  }))
                }
              />
            </label>

            {submitError && (
              <p
                className="form-submit-error"
                role="alert"
              >
                {submitError}
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
              className="primary-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Saving..."
                : isEditing
                  ? "Save changes"
                  : "Create issue"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default IssueModal;