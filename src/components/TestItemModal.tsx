import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import type {
  TestItem,
  TestItemInput,
  TestItemResult,
} from "../types/testRecord";

interface TestItemModalProps {
  isOpen: boolean;
  testItem: TestItem | null;
  nextSortOrder: number;
  onClose: () => void;
  onSave: (input: TestItemInput) => Promise<void>;
}

function createEmptyForm(
  nextSortOrder: number,
): TestItemInput {
  return {
    description: "",
    acceptanceCriteria: "",
    result: "pending",
    notes: "",
    sortOrder: nextSortOrder,
  };
}

function TestItemModal({
  isOpen,
  testItem,
  nextSortOrder,
  onClose,
  onSave,
}: TestItemModalProps) {
  const [form, setForm] = useState<TestItemInput>(() =>
    createEmptyForm(nextSortOrder),
  );

  const [descriptionError, setDescriptionError] =
    useState("");

  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] =
    useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (testItem) {
      setForm({
        description: testItem.description,
        acceptanceCriteria:
          testItem.acceptanceCriteria,
        result: testItem.result,
        notes: testItem.notes,
        sortOrder: testItem.sortOrder,
      });
    } else {
      setForm(createEmptyForm(nextSortOrder));
    }

    setDescriptionError("");
    setSubmitError("");
    setIsSubmitting(false);
  }, [isOpen, nextSortOrder, testItem]);

  if (!isOpen) {
    return null;
  }

  const isEditing = testItem !== null;

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

    const description = form.description.trim();

    if (!description) {
      setDescriptionError(
        "Item description is required.",
      );

      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      await onSave({
        description,
        acceptanceCriteria:
          form.acceptanceCriteria.trim(),
        result: form.result,
        notes: form.notes.trim(),
        sortOrder: form.sortOrder,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to save the checklist item.",
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
        aria-labelledby="test-item-modal-title"
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <h2
              id="test-item-modal-title"
              className="modal-form-title"
            >
              {isEditing
                ? "Edit checklist item"
                : "Add checklist item"}
            </h2>

            <label className="form-field">
              <span>
                Item description <strong>*</strong>
              </span>

              <input
                autoFocus
                type="text"
                value={form.description}
                disabled={isSubmitting}
                className={
                  descriptionError
                    ? "input-error"
                    : ""
                }
                placeholder="Example: Verify valve tag and service"
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }));

                  if (descriptionError) {
                    setDescriptionError("");
                  }

                  if (submitError) {
                    setSubmitError("");
                  }
                }}
              />

              {descriptionError && (
                <span
                  className="field-error"
                  role="alert"
                >
                  {descriptionError}
                </span>
              )}
            </label>

            <label className="form-field">
              <span>Acceptance criteria</span>

              <textarea
                value={form.acceptanceCriteria}
                disabled={isSubmitting}
                placeholder="Example: Tag is XV-321 and matches the approved equipment list"
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    acceptanceCriteria:
                      event.target.value,
                  }));

                  if (submitError) {
                    setSubmitError("");
                  }
                }}
              />
            </label>

            <label className="form-field">
              <span>Result</span>

              <select
                value={form.result}
                disabled={isSubmitting}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    result:
                      event.target
                        .value as TestItemResult,
                  }));

                  if (submitError) {
                    setSubmitError("");
                  }
                }}
              >
                <option value="pending">
                  Pending
                </option>

                <option value="pass">
                  Pass
                </option>

                <option value="fail">
                  Fail
                </option>

                <option value="not_applicable">
                  N/A
                </option>
              </select>
            </label>

            <label className="form-field">
              <span>Notes</span>

              <textarea
                value={form.notes}
                disabled={isSubmitting}
                placeholder="Enter observations, readings, deficiencies, or supporting details"
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
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
                  : "Add item"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default TestItemModal;