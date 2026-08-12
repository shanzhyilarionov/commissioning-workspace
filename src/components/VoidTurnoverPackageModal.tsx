import { useEffect, useState, type FormEvent } from "react";
import type { TurnoverPackageSummary } from "../types/turnover";

interface VoidTurnoverPackageModalProps {
  turnoverPackage: TurnoverPackageSummary | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

function VoidTurnoverPackageModal({
  turnoverPackage,
  isSubmitting,
  error,
  onClose,
  onConfirm,
}: VoidTurnoverPackageModalProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    setReason("");
  }, [turnoverPackage?.id]);

  if (!turnoverPackage) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (reason.trim()) {
      void onConfirm(reason);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal modal-small void-turnover-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="void-turnover-title"
        aria-describedby="void-turnover-description"
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <h2 id="void-turnover-title" className="modal-form-title">
              Void turnover package
            </h2>
            <p id="void-turnover-description" className="modal-message">
              Void <strong>{turnoverPackage.packageNumber}</strong>, revision{" "}
              <strong>{turnoverPackage.revision}</strong>? The package snapshot
              will remain in the audit history and future PDF exports will be
              marked VOID.
            </p>
            <label className="form-field void-turnover-reason-field">
              <span>Void reason *</span>
              <textarea
                autoFocus
                value={reason}
                disabled={isSubmitting}
                placeholder="Explain why this final package is being voided"
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {error && (
              <p className="form-submit-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="secondary-button"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="danger-button"
              disabled={isSubmitting || !reason.trim()}
            >
              {isSubmitting ? "Voiding package..." : "Void package"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default VoidTurnoverPackageModal;
