import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getNextCommissioningStage } from "../repositories/readinessRepository";
import type {
  ReadinessBlocker,
  StageTransitionInput,
  StructureReadinessReview,
} from "../types/readiness";
import type { CommissioningStage } from "../types/system";

interface ReadinessReviewModalProps {
  review: StructureReadinessReview | null;
  isLoading: boolean;
  loadError: string | null;
  onClose: () => void;
  onRetry: () => void;
  onNavigate: (blocker: ReadinessBlocker) => void;
  onTransition: (input: StageTransitionInput) => Promise<void>;
}

function formatStage(stage: CommissioningStage): string {
  switch (stage) {
    case "not_started":
      return "Not started";
    case "in_progress":
      return "In progress";
    case "ready":
      return "Ready";
    case "commissioned":
      return "Commissioned";
    case "handed_over":
      return "Handed over";
  }
}

function formatBlockerType(type: ReadinessBlocker["type"]): string {
  switch (type) {
    case "no_assets":
      return "Structure";
    case "incomplete_asset":
      return "Asset";
    case "pending_test_item":
      return "Pending test";
    case "failed_test_item":
      return "Failed test";
    case "unsigned_test_record":
      return "Unsigned record";
    case "critical_issue":
      return "Critical issue";
    case "required_document":
      return "Required document";
  }
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReadinessReviewModal({
  review,
  isLoading,
  loadError,
  onClose,
  onRetry,
  onNavigate,
  onTransition,
}: ReadinessReviewModalProps) {
  const [recordedBy, setRecordedBy] = useState("");
  const [reason, setReason] = useState("");
  const [force, setForce] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const targetStage = useMemo(
    () => (review ? getNextCommissioningStage(review.stage) : null),
    [review],
  );

  useEffect(() => {
    setRecordedBy("");
    setReason("");
    setForce(false);
    setIsSubmitting(false);
    setSubmitError("");
  }, [review?.structureId, review?.stage]);

  if (!isLoading && !loadError && !review) {
    return null;
  }

  const readinessRequired = targetStage !== null && targetStage !== "in_progress";
  const transitionBlocked =
    readinessRequired && (review?.blockers.length ?? 0) > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!targetStage) {
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);

    try {
      await onTransition({
        targetStage,
        recordedBy,
        reason,
        force,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to update the commissioning stage.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal readiness-review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="readiness-review-title"
      >
        {isLoading ? (
          <div className="modal-body readiness-modal-state">
            <h2 id="readiness-review-title" className="modal-form-title">
              Reviewing readiness
            </h2>
            <p>Calculating current blockers and stage records.</p>
          </div>
        ) : loadError ? (
          <div className="modal-body readiness-modal-state">
            <h2 id="readiness-review-title" className="modal-form-title">
              Unable to review readiness
            </h2>
            <p>{loadError}</p>
            <div className="readiness-state-actions">
              <button className="secondary-button" type="button" onClick={onClose}>
                Close
              </button>
              <button className="primary-button" type="button" onClick={onRetry}>
                Try again
              </button>
            </div>
          </div>
        ) : review ? (
          <form onSubmit={handleSubmit}>
            <div className="readiness-modal-scroll">
              <div className="modal-body readiness-modal-body">
                <div className="readiness-modal-heading">
                  <div>
                    <h2 id="readiness-review-title" className="modal-form-title">
                      Readiness review
                    </h2>
                    <p>
                      {review.code ? `${review.code} · ` : ""}
                      {review.name}
                    </p>
                  </div>
                  <span className={`status-badge ${review.stage}`}>
                    {formatStage(review.stage)}
                  </span>
                </div>

                <div className="readiness-summary-grid">
                  <div>
                    <span>Current stage</span>
                    <strong>{formatStage(review.stage)}</strong>
                  </div>
                  <div>
                    <span>Readiness</span>
                    <strong className={review.blockers.length === 0 ? "ready" : "blocked"}>
                      {review.blockers.length === 0
                        ? "All requirements met"
                        : `${review.blockers.length} blockers`}
                    </strong>
                  </div>
                  <div>
                    <span>Next stage</span>
                    <strong>
                      {targetStage ? formatStage(targetStage) : "Workflow complete"}
                    </strong>
                  </div>
                </div>

                <section className="readiness-modal-section">
                  <div className="readiness-section-heading">
                    <div>
                      <h3>Blockers</h3>
                      <p>Current records preventing an unqualified stage transition.</p>
                    </div>
                    <span>{review.blockers.length}</span>
                  </div>

                  {review.blockers.length === 0 ? (
                    <div className="readiness-clear-state">
                      <strong>Ready to proceed</strong>
                      <span>No readiness blockers were found.</span>
                    </div>
                  ) : (
                    <div className="readiness-blocker-list">
                      {review.blockers.map((blocker) => (
                        <button
                          key={blocker.id}
                          className="readiness-blocker-item"
                          type="button"
                          onClick={() => onNavigate(blocker)}
                        >
                          <span className="readiness-blocker-kind">
                            {formatBlockerType(blocker.type)}
                          </span>
                          <span className="readiness-blocker-copy">
                            <strong>{blocker.title}</strong>
                            <small>{blocker.detail}</small>
                          </span>
                          <span className={`status-badge ${blocker.status}`}>
                            {blocker.status.replace(/_/g, " ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                {targetStage && (
                  <section className="readiness-modal-section">
                    <div className="readiness-section-heading">
                      <div>
                        <h3>Advance stage</h3>
                        <p>
                          Record responsibility and any qualification for this change.
                        </p>
                      </div>
                    </div>

                    <div className="readiness-transition-grid">
                      <label className="form-field">
                        <span>
                          Recorded by <strong>*</strong>
                        </span>
                        <input
                          type="text"
                          value={recordedBy}
                          disabled={isSubmitting}
                          placeholder="Technician, engineer, or approver"
                          onChange={(event) => {
                            setRecordedBy(event.target.value);
                            setSubmitError("");
                          }}
                        />
                      </label>

                      <label className="form-field readiness-reason-field">
                        <span>
                          Reason {transitionBlocked && force ? <strong>*</strong> : null}
                        </span>
                        <textarea
                          value={reason}
                          disabled={isSubmitting}
                          placeholder="Optional notes, limitations, or turnover conditions"
                          onChange={(event) => {
                            setReason(event.target.value);
                            setSubmitError("");
                          }}
                        />
                      </label>
                    </div>

                    {transitionBlocked && (
                      <label className="readiness-force-option">
                        <input
                          type="checkbox"
                          checked={force}
                          disabled={isSubmitting}
                          onChange={(event) => {
                            setForce(event.target.checked);
                            setSubmitError("");
                          }}
                        />
                        <span>
                          <strong>Force this transition</strong>
                          <small>
                            The stage record will preserve the blocker snapshot and
                            require a reason.
                          </small>
                        </span>
                      </label>
                    )}

                    {submitError && (
                      <p className="form-submit-error" role="alert">
                        {submitError}
                      </p>
                    )}
                  </section>
                )}

                <section className="readiness-modal-section">
                  <div className="readiness-section-heading">
                    <div>
                      <h3>Stage records</h3>
                      <p>Permanent commissioning and turnover history.</p>
                    </div>
                    <span>{review.records.length}</span>
                  </div>

                  {review.records.length === 0 ? (
                    <div className="readiness-history-empty">
                      No stage changes have been recorded yet.
                    </div>
                  ) : (
                    <div className="readiness-history-list">
                      {review.records.map((record) => (
                        <article key={record.id} className="readiness-history-item">
                          <div className="readiness-history-heading">
                            <strong>
                              {formatStage(record.fromStage)} → {formatStage(record.toStage)}
                            </strong>
                            <time>{formatDateTime(record.createdAt)}</time>
                          </div>
                          <p>
                            Recorded by {record.recordedBy}
                            {record.forced ? " · Forced transition" : ""}
                            {` · ${record.blockerCount} blockers at transition`}
                          </p>
                          {record.reason && <span>{record.reason}</span>}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>

            <div className="modal-footer readiness-modal-footer">
              <button
                className="secondary-button"
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
              >
                Close
              </button>
              {targetStage && (
                <button
                  className="primary-button"
                  type="submit"
                  disabled={isSubmitting || (transitionBlocked && !force)}
                >
                  {isSubmitting
                    ? "Saving stage..."
                    : `Mark as ${formatStage(targetStage).toLowerCase()}`}
                </button>
              )}
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}

export default ReadinessReviewModal;
