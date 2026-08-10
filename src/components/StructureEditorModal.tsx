import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import type {
  CommissioningSystem,
  StructureInput,
  Subsystem,
} from "../types/system";

interface StructureEditorModalProps {
  isOpen: boolean;
  kind: "system" | "subsystem";
  record: CommissioningSystem | Subsystem | null;
  parentSystemName?: string;
  onClose: () => void;
  onSave: (input: StructureInput) => Promise<void>;
}

const emptyForm: StructureInput = {
  code: "",
  name: "",
  description: "",
};

function StructureEditorModal({
  isOpen,
  kind,
  record,
  parentSystemName,
  onClose,
  onSave,
}: StructureEditorModalProps) {
  const [form, setForm] = useState<StructureInput>(emptyForm);
  const [nameError, setNameError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = record !== null;
  const label = kind === "system" ? "system" : "subsystem";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setForm(
      record
        ? {
            code: record.code,
            name: record.name,
            description: record.description,
          }
        : emptyForm,
    );
    setNameError("");
    setSubmitError("");
  }, [isOpen, record]);

  if (!isOpen) {
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedForm: StructureInput = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
    };

    if (!normalizedForm.name) {
      setNameError(
        kind === "system"
          ? "System name is required."
          : "Subsystem name is required.",
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      await onSave(normalizedForm);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : `Failed to ${isEditing ? "update" : "create"} the ${label}.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal structure-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="structure-editor-title"
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <h2 id="structure-editor-title" className="modal-form-title">
              {isEditing ? `Edit ${label}` : `Create ${label}`}
            </h2>

            {kind === "subsystem" && parentSystemName && (
              <div className="structure-parent-summary">
                <span>System</span>
                <strong>{parentSystemName}</strong>
              </div>
            )}

            <label className="form-field">
              <span>Code</span>
              <input
                autoFocus
                type="text"
                value={form.code}
                disabled={isSubmitting}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    code: event.target.value,
                  }));
                  if (submitError) {
                    setSubmitError("");
                  }
                }}
                placeholder={kind === "system" ? "ELEC" : "ELEC-LV"}
              />
            </label>

            <label className="form-field">
              <span>
                Name <strong>*</strong>
              </span>
              <input
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
                placeholder={
                  kind === "system"
                    ? "Electrical"
                    : "Low Voltage Distribution"
                }
              />
              {nameError && (
                <small className="field-error">{nameError}</small>
              )}
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
                placeholder={`Optional ${label} description`}
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
                ? isEditing
                  ? "Saving..."
                  : "Creating..."
                : isEditing
                  ? "Save changes"
                  : `Create ${label}`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default StructureEditorModal;
