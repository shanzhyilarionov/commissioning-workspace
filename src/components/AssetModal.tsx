import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import type {
  Asset,
  AssetInput,
  AssetStatus,
} from "../types/asset";

interface AssetModalProps {
  isOpen: boolean;
  projectName: string;
  asset: Asset | null;
  onClose: () => void;
  onSave: (input: AssetInput) => Promise<void>;
}

const emptyForm: AssetInput = {
  systemName: "",
  tag: "",
  name: "",
  assetType: "",
  status: "not_started",
  description: "",
};

function AssetModal({
  isOpen,
  projectName,
  asset,
  onClose,
  onSave,
}: AssetModalProps) {
  const [form, setForm] =
    useState<AssetInput>(emptyForm);

  const [tagError, setTagError] = useState("");
  const [nameError, setNameError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] =
    useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (asset) {
      setForm({
        systemName: asset.systemName,
        tag: asset.tag,
        name: asset.name,
        assetType: asset.assetType,
        status: asset.status,
        description: asset.description,
      });
    } else {
      setForm(emptyForm);
    }

    setTagError("");
    setNameError("");
    setSubmitError("");
  }, [isOpen, asset]);

  if (!isOpen) {
    return null;
  }

  const isEditing = asset !== null;

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

    const tag = form.tag.trim();
    const name = form.name.trim();

    let hasError = false;

    if (!tag) {
      setTagError("Asset tag is required.");
      hasError = true;
    }

    if (!name) {
      setNameError("Asset name is required.");
      hasError = true;
    }

    if (hasError) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      await onSave({
        systemName: form.systemName.trim(),
        tag,
        name,
        assetType: form.assetType.trim(),
        status: form.status,
        description: form.description.trim(),
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to save the asset.",
      );
    } finally {
      setIsSubmitting(false);
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
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-modal-title"
      >

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <h2
              id="asset-modal-title"
              className="modal-form-title"
            >
              {isEditing ? "Edit asset" : "Create asset"}
            </h2>
            <div className="asset-form-row">
              <label className="form-field">
                <span>
                  Tag <strong>*</strong>
                </span>

                <input
                  autoFocus
                  type="text"
                  value={form.tag}
                  className={tagError ? "input-error" : ""}
                  disabled={isSubmitting}
                  placeholder="P-101"
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      tag: event.target.value,
                    }));

                    if (tagError) {
                      setTagError("");
                    }

                    if (submitError) {
                      setSubmitError("");
                    }
                  }}
                />

                {tagError && (
                  <small className="field-error">
                    {tagError}
                  </small>
                )}
              </label>

              <label className="form-field">
                <span>Asset type</span>

                <input
                  type="text"
                  value={form.assetType}
                  disabled={isSubmitting}
                  placeholder="Centrifugal pump"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      assetType: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label className="form-field">
              <span>
                Asset name <strong>*</strong>
              </span>

              <input
                type="text"
                value={form.name}
                className={nameError ? "input-error" : ""}
                disabled={isSubmitting}
                placeholder="Primary Feedwater Pump"
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

            <div className="asset-form-row">
              <label className="form-field">
                <span>System</span>

                <input
                  type="text"
                  value={form.systemName}
                  disabled={isSubmitting}
                  placeholder="Feedwater System"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      systemName: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="form-field">
                <span>Status</span>

                <select
                  value={form.status}
                  disabled={isSubmitting}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status:
                        event.target.value as AssetStatus,
                    }))
                  }
                >
                  <option value="not_started">
                    Not started
                  </option>

                  <option value="in_progress">
                    In progress
                  </option>

                  <option value="completed">
                    Completed
                  </option>

                  <option value="blocked">
                    Blocked
                  </option>
                </select>
              </label>
            </div>

            <label className="form-field">
              <span>Description</span>

              <textarea
                rows={4}
                value={form.description}
                disabled={isSubmitting}
                placeholder="Optional equipment or commissioning notes"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
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
                  : "Create asset"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default AssetModal;