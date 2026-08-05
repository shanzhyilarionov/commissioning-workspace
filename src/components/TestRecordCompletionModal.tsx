import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import type {
  TestRecord,
  TestRecordCompletionInput,
} from "../types/testRecord";

interface TestRecordCompletionModalProps {
  isOpen: boolean;
  testRecord: TestRecord;
  onClose: () => void;
  onComplete: (
    input: TestRecordCompletionInput,
  ) => Promise<void>;
}

function getLocalDate(): string {
  const date = new Date();
  const timezoneOffset =
    date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - timezoneOffset)
    .toISOString()
    .slice(0, 10);
}

function TestRecordCompletionModal({
  isOpen,
  testRecord,
  onClose,
  onComplete,
}: TestRecordCompletionModalProps) {
  const [form, setForm] =
    useState<TestRecordCompletionInput>({
      executedBy: "",
      witnessedBy: "",
      executionDate: getLocalDate(),
      signedOffBy: "",
      completionNotes: "",
    });
  const [submitError, setSubmitError] =
    useState("");
  const [isSubmitting, setIsSubmitting] =
    useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setForm({
      executedBy: testRecord.executedBy,
      witnessedBy: testRecord.witnessedBy,
      executionDate:
        testRecord.executionDate ?? getLocalDate(),
      signedOffBy: testRecord.signedOffBy,
      completionNotes: testRecord.completionNotes,
    });
    setSubmitError("");
    setIsSubmitting(false);
  }, [isOpen, testRecord]);

  if (!isOpen) {
    return null;
  }

  function handleClose() {
    if (!isSubmitting) {
      onClose();
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setSubmitError("");
    setIsSubmitting(true);

    try {
      await onComplete(form);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to complete the record.",
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
        className="modal test-record-completion-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-record-completion-title"
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <h2
              id="test-record-completion-title"
              className="modal-form-title"
            >
              Complete and sign record
            </h2>

            <p className="completion-modal-description">
              All items must be resolved. Every failed item
              must have a linked issue before this record can
              be signed.
            </p>

            <div className="completion-form-grid">
              <label className="form-field">
                <span>
                  Executed by <strong>*</strong>
                </span>
                <input
                  autoFocus
                  type="text"
                  value={form.executedBy}
                  disabled={isSubmitting}
                  placeholder="Technician or engineer name"
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      executedBy: event.target.value,
                    }));
                    setSubmitError("");
                  }}
                />
              </label>

              <label className="form-field">
                <span>Witnessed by</span>
                <input
                  type="text"
                  value={form.witnessedBy}
                  disabled={isSubmitting}
                  placeholder="Optional witness name"
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      witnessedBy: event.target.value,
                    }));
                    setSubmitError("");
                  }}
                />
              </label>

              <label className="form-field">
                <span>
                  Execution date <strong>*</strong>
                </span>
                <input
                  type="date"
                  value={form.executionDate}
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      executionDate: event.target.value,
                    }));
                    setSubmitError("");
                  }}
                />
              </label>

              <label className="form-field">
                <span>
                  Signed off by <strong>*</strong>
                </span>
                <input
                  type="text"
                  value={form.signedOffBy}
                  disabled={isSubmitting}
                  placeholder="Approver name"
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      signedOffBy: event.target.value,
                    }));
                    setSubmitError("");
                  }}
                />
              </label>
            </div>

            <label className="form-field">
              <span>Completion notes</span>
              <textarea
                value={form.completionNotes}
                disabled={isSubmitting}
                placeholder="Final readings, exceptions, handover notes, or limitations"
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    completionNotes: event.target.value,
                  }));
                  setSubmitError("");
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
                ? "Signing..."
                : "Complete and sign"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default TestRecordCompletionModal;
