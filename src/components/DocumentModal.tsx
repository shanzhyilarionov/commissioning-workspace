import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import type { Asset } from "../types/asset";
import type {
  DocumentCategory,
  DocumentStatus,
  ProjectDocument,
  ProjectDocumentInput,
} from "../types/document";

interface DocumentModalProps {
  isOpen: boolean;
  document: ProjectDocument | null;
  sourceFileName: string | null;
  assets: Asset[];
  onClose: () => void;
  onSave: (input: ProjectDocumentInput) => Promise<void>;
}

const emptyForm: ProjectDocumentInput = {
  assetId: null,
  title: "",
  category: "other",
  revision: "",
  status: "draft",
  notes: "",
};

function titleFromFileName(fileName: string) {
  const extensionIndex = fileName.lastIndexOf(".");

  if (extensionIndex <= 0) {
    return fileName;
  }

  return fileName.slice(0, extensionIndex);
}

function DocumentModal({
  isOpen,
  document,
  sourceFileName,
  assets,
  onClose,
  onSave,
}: DocumentModalProps) {
  const [form, setForm] =
    useState<ProjectDocumentInput>(emptyForm);
  const [titleError, setTitleError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (document) {
      setForm({
        assetId: document.assetId,
        title: document.title,
        category: document.category,
        revision: document.revision,
        status: document.status,
        notes: document.notes,
      });
    } else {
      setForm({
        ...emptyForm,
        title: sourceFileName
          ? titleFromFileName(sourceFileName)
          : "",
      });
    }

    setTitleError("");
    setSubmitError("");
    setIsSubmitting(false);
  }, [document, isOpen, sourceFileName]);

  if (!isOpen) {
    return null;
  }

  const isEditing = document !== null;
  const displayedFileName =
    document?.originalFileName ?? sourceFileName ?? "No file selected";

  function handleClose() {
    if (!isSubmitting) {
      onClose();
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const title = form.title.trim();

    if (!title) {
      setTitleError("Document title is required.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      await onSave({
        assetId: form.assetId,
        title,
        category: form.category,
        revision: form.revision.trim(),
        status: form.status,
        notes: form.notes.trim(),
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to save the document.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal document-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-modal-title"
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <h2
              id="document-modal-title"
              className="modal-form-title"
            >
              {isEditing ? "Edit document" : "Import document"}
            </h2>

            <div className="document-file-summary">
              <span>File</span>
              <strong title={displayedFileName}>
                {displayedFileName}
              </strong>
            </div>

            <label className="form-field">
              <span>
                Title <strong>*</strong>
              </span>
              <input
                autoFocus
                type="text"
                value={form.title}
                className={titleError ? "input-error" : ""}
                disabled={isSubmitting}
                placeholder="Motor control centre commissioning report"
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }));
                  setTitleError("");
                  setSubmitError("");
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
                <span>Category</span>
                <select
                  value={form.category}
                  disabled={isSubmitting}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category:
                        event.target.value as DocumentCategory,
                    }))
                  }
                >
                  <option value="drawing">Drawing</option>
                  <option value="specification">Specification</option>
                  <option value="datasheet">Data sheet</option>
                  <option value="manual">Manual</option>
                  <option value="procedure">Procedure</option>
                  <option value="certificate">Certificate</option>
                  <option value="test_record">Test record</option>
                  <option value="report">Report</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="form-field">
                <span>Revision</span>
                <input
                  type="text"
                  value={form.revision}
                  disabled={isSubmitting}
                  placeholder="Optional"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      revision: event.target.value,
                    }))
                  }
                />
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
                        event.target.value as DocumentStatus,
                    }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="for_review">For review</option>
                  <option value="approved">Approved</option>
                  <option value="superseded">Superseded</option>
                </select>
              </label>

              <label className="form-field">
                <span>Linked asset</span>
                <select
                  value={form.assetId ?? ""}
                  disabled={isSubmitting}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      assetId: event.target.value || null,
                    }))
                  }
                >
                  <option value="">No linked asset</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.tag} — {asset.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="form-field">
              <span>Notes</span>
              <textarea
                value={form.notes}
                disabled={isSubmitting}
                placeholder="Add document notes or review information"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
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
                ? isEditing
                  ? "Saving..."
                  : "Importing..."
                : isEditing
                  ? "Save changes"
                  : "Import document"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default DocumentModal;
