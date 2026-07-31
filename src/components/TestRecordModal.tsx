import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import type { Asset } from "../types/asset";
import type {
  TestRecord,
  TestRecordInput,
  TestRecordType,
} from "../types/testRecord";

interface TestRecordModalProps {
  isOpen: boolean;
  assets: Asset[];
  testRecord: TestRecord | null;
  onClose: () => void;
  onSave: (input: TestRecordInput) => Promise<void>;
}

function createEmptyForm(): TestRecordInput {
  return {
    assetId: null,
    title: "",
    recordType: "checklist",
    description: "",
  };
}

function TestRecordModal({
  isOpen,
  assets,
  testRecord,
  onClose,
  onSave,
}: TestRecordModalProps) {
  const [form, setForm] = useState<TestRecordInput>(
    createEmptyForm,
  );

  const [titleError, setTitleError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (testRecord) {
      setForm({
        assetId: testRecord.assetId,
        title: testRecord.title,
        recordType: testRecord.recordType,
        description: testRecord.description,
      });
    } else {
      setForm(createEmptyForm());
    }

    setTitleError("");
    setSubmitError("");
    setIsSubmitting(false);
  }, [isOpen, testRecord]);

  if (!isOpen) {
    return null;
  }

  const isEditing = testRecord !== null;

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
      setTitleError("Title is required.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      await onSave({
        assetId: form.assetId,
        title,
        recordType: form.recordType,
        description: form.description.trim(),
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to save the checklist or test.",
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
        aria-labelledby="test-record-modal-title"
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <h2
              id="test-record-modal-title"
              className="modal-form-title"
            >
              {isEditing
                ? "Edit checklist or test"
                : "Create checklist or test"}
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
                placeholder="Enter checklist or test title"
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
                <span
                  className="field-error"
                  role="alert"
                >
                  {titleError}
                </span>
              )}
            </label>

            <div className="asset-form-row">
              <label className="form-field">
                <span>Type</span>

                <select
                  value={form.recordType}
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      recordType:
                        event.target
                          .value as TestRecordType,
                    }));

                    if (submitError) {
                      setSubmitError("");
                    }
                  }}
                >
                  <option value="checklist">
                    Checklist
                  </option>

                  <option value="functional_test">
                    Functional test
                  </option>
                </select>
              </label>

              <label className="form-field">
                <span>Asset</span>

                <select
                  value={form.assetId ?? ""}
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      assetId:
                        event.target.value || null,
                    }));

                    if (submitError) {
                      setSubmitError("");
                    }
                  }}
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
            </div>

            <label className="form-field">
              <span>Description</span>

              <textarea
                value={form.description}
                disabled={isSubmitting}
                placeholder="Enter purpose, scope, or instructions"
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
                  : "Create record"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default TestRecordModal;