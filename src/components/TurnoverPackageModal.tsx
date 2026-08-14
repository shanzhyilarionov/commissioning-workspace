import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { getTurnoverPackagePreflight } from "../repositories/turnoverRepository";
import type { StructureKind } from "../types/readiness";
import type {
  CommissioningStage,
  CommissioningSystem,
  Subsystem,
} from "../types/system";
import type {
  CreateTurnoverPackageInput,
  TurnoverPackageCreationStatus,
  TurnoverPackagePreflight,
} from "../types/turnover";

interface TurnoverPackageModalProps {
  isOpen: boolean;
  projectId: string;
  systems: CommissioningSystem[];
  subsystems: Subsystem[];
  onClose: () => void;
  onCreate: (input: CreateTurnoverPackageInput) => Promise<void>;
}

const emptyForm: CreateTurnoverPackageInput = {
  scopeKind: "system",
  scopeId: "",
  packageNumber: "",
  revision: "A",
  status: "draft",
  preparedBy: "",
  approvedBy: "",
  notes: "",
};

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

function TurnoverPackageModal({
  isOpen,
  projectId,
  systems,
  subsystems,
  onClose,
  onCreate,
}: TurnoverPackageModalProps) {
  const [form, setForm] = useState<CreateTurnoverPackageInput>(emptyForm);
  const [preflight, setPreflight] =
    useState<TurnoverPackagePreflight | null>(null);
  const [isLoadingPreflight, setIsLoadingPreflight] = useState(false);
  const [preflightError, setPreflightError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const subsystemsBySystem = useMemo(
    () =>
      systems
        .map((system) => ({
          system,
          subsystems: subsystems.filter(
            (subsystem) => subsystem.systemId === system.id,
          ),
        }))
        .filter((group) => group.subsystems.length > 0),
    [subsystems, systems],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const initialKind: StructureKind =
      systems.length > 0 ? "system" : "subsystem";
    const initialScopeId =
      initialKind === "system"
        ? systems[0]?.id ?? ""
        : subsystems[0]?.id ?? "";

    setForm({
      ...emptyForm,
      scopeKind: initialKind,
      scopeId: initialScopeId,
    });
    setPreflight(null);
    setPreflightError("");
    setSubmitError("");
    setIsSubmitting(false);
  }, [isOpen, subsystems, systems]);

  useEffect(() => {
    if (!isOpen || !form.scopeId) {
      setPreflight(null);
      setIsLoadingPreflight(false);
      return;
    }

    let cancelled = false;

    async function loadPreflight() {
      setIsLoadingPreflight(true);
      setPreflightError("");
      setPreflight(null);

      try {
        const result = await getTurnoverPackagePreflight(
          projectId,
          form.scopeKind,
          form.scopeId,
        );

        if (!cancelled) {
          setPreflight(result);
          setForm((current) => ({
            ...current,
            packageNumber:
              current.packageNumber || result.suggestedPackageNumber,
            status:
              current.status === "final" && !result.eligibleForFinal
                ? "draft"
                : current.status,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setPreflightError(
            error instanceof Error
              ? error.message
              : "Failed to review the selected scope.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPreflight(false);
        }
      }
    }

    void loadPreflight();

    return () => {
      cancelled = true;
    };
  }, [form.scopeId, form.scopeKind, isOpen, projectId]);

  if (!isOpen) {
    return null;
  }

  const hasAnyScope = systems.length > 0 || subsystems.length > 0;

  function handleScopeKindChange(kind: StructureKind) {
    const scopeId =
      kind === "system" ? systems[0]?.id ?? "" : subsystems[0]?.id ?? "";

    setForm((current) => ({
      ...current,
      scopeKind: kind,
      scopeId,
      packageNumber: "",
      status: "draft",
    }));
    setSubmitError("");
  }

  function handleScopeChange(scopeId: string) {
    setForm((current) => ({
      ...current,
      scopeId,
      packageNumber: "",
      status: "draft",
    }));
    setSubmitError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    if (!preflight) {
      setSubmitError("Complete the scope readiness review before creating a package.");
      return;
    }

    if (form.status === "final" && !preflight.eligibleForFinal) {
      setSubmitError(
        preflight.finalEligibilityReason ??
          "The selected scope is not eligible for a final package.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      await onCreate(form);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to create the turnover package.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal turnover-package-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="turnover-package-modal-title"
      >
        <form onSubmit={handleSubmit}>
          <div className="turnover-modal-scroll">
            <div className="modal-body turnover-modal-body">
              <div>
                <h2
                  id="turnover-package-modal-title"
                  className="modal-form-title"
                >
                  New turnover package
                </h2>
              </div>

              {!hasAnyScope ? (
                <div className="turnover-modal-empty">
                  Create a system or subsystem before generating a turnover package.
                </div>
              ) : (
                <>
                  <div className="turnover-form-grid">
                    <label className="form-field">
                      <span>Scope type</span>
                      <select
                        value={form.scopeKind}
                        disabled={isSubmitting}
                        onChange={(event) =>
                          handleScopeKindChange(
                            event.target.value as StructureKind,
                          )
                        }
                      >
                        <option value="system" disabled={systems.length === 0}>
                          System
                        </option>
                        <option
                          value="subsystem"
                          disabled={subsystems.length === 0}
                        >
                          Subsystem
                        </option>
                      </select>
                    </label>

                    <label className="form-field">
                      <span>Scope</span>
                      <select
                        value={form.scopeId}
                        disabled={isSubmitting}
                        onChange={(event) => handleScopeChange(event.target.value)}
                      >
                        {form.scopeKind === "system"
                          ? systems.map((system) => (
                              <option key={system.id} value={system.id}>
                                {system.code ? `${system.code} - ` : ""}
                                {system.name}
                              </option>
                            ))
                          : subsystemsBySystem.map((group) => (
                              <optgroup
                                key={group.system.id}
                                label={
                                  group.system.code
                                    ? `${group.system.code} - ${group.system.name}`
                                    : group.system.name
                                }
                              >
                                {group.subsystems.map((subsystem) => (
                                  <option key={subsystem.id} value={subsystem.id}>
                                    {subsystem.code
                                      ? `${subsystem.code} - `
                                      : ""}
                                    {subsystem.name}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                      </select>
                    </label>
                  </div>

                  {isLoadingPreflight ? (
                    <div className="turnover-preflight-state">
                      Reviewing scope readiness...
                    </div>
                  ) : preflightError ? (
                    <p className="form-submit-error" role="alert">
                      {preflightError}
                    </p>
                  ) : preflight ? (
                    <section className="turnover-preflight">
                      <div className="turnover-preflight-heading">
                        <div>
                          <h3>Package preflight</h3>
                          <p>
                            Current records will be frozen when the package is
                            created.
                          </p>
                        </div>
                        <span className={`status-badge ${preflight.scope.stage}`}>
                          {formatStage(preflight.scope.stage)}
                        </span>
                      </div>

                      <div className="turnover-preflight-grid">
                        <div>
                          <span>Blockers</span>
                          <strong
                            className={
                              preflight.blockerCount > 0 ? "blocked" : "clear"
                            }
                          >
                            {preflight.blockerCount}
                          </strong>
                        </div>
                        <div>
                          <span>Assets</span>
                          <strong>{preflight.assetCount}</strong>
                        </div>
                        <div>
                          <span>Test records</span>
                          <strong>{preflight.testRecordCount}</strong>
                        </div>
                        <div>
                          <span>Issues</span>
                          <strong>{preflight.issueCount}</strong>
                        </div>
                        <div>
                          <span>Documents</span>
                          <strong>{preflight.documentCount}</strong>
                        </div>
                        <div>
                          <span>Forced transitions</span>
                          <strong
                            className={
                              preflight.forcedTransitionCount > 0
                                ? "warning"
                                : ""
                            }
                          >
                            {preflight.forcedTransitionCount}
                          </strong>
                        </div>
                      </div>

                      <div
                        className={
                          preflight.eligibleForFinal
                            ? "turnover-final-eligibility eligible"
                            : "turnover-final-eligibility"
                        }
                      >
                        <strong>
                          {preflight.eligibleForFinal
                            ? "Eligible for a final package"
                            : "Draft package only"}
                        </strong>
                        <span>
                          {preflight.eligibleForFinal
                            ? "The scope is commissioned and has no current readiness blockers."
                            : preflight.finalEligibilityReason}
                        </span>
                      </div>
                    </section>
                  ) : null}

                  <div className="turnover-form-grid turnover-identity-grid">
                    <label className="form-field">
                      <span>
                        Package number <strong>*</strong>
                      </span>
                      <input
                        type="text"
                        value={form.packageNumber}
                        disabled={isSubmitting}
                        placeholder="ELEC-TOP-001"
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            packageNumber: event.target.value,
                          }));
                          setSubmitError("");
                        }}
                      />
                    </label>

                    <label className="form-field">
                      <span>
                        Revision <strong>*</strong>
                      </span>
                      <input
                        type="text"
                        value={form.revision}
                        disabled={isSubmitting}
                        placeholder="A"
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            revision: event.target.value,
                          }));
                          setSubmitError("");
                        }}
                      />
                    </label>
                  </div>

                  <div className="turnover-form-grid">
                    <label className="form-field">
                      <span>Package status</span>
                      <select
                        value={form.status}
                        disabled={isSubmitting || !preflight}
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            status: event.target
                              .value as TurnoverPackageCreationStatus,
                          }));
                          setSubmitError("");
                        }}
                      >
                        <option value="draft">Draft</option>
                        <option
                          value="final"
                          disabled={!preflight?.eligibleForFinal}
                        >
                          Final
                        </option>
                      </select>
                    </label>

                    <label className="form-field">
                      <span>
                        Prepared by <strong>*</strong>
                      </span>
                      <input
                        type="text"
                        value={form.preparedBy}
                        disabled={isSubmitting}
                        placeholder="Commissioning engineer"
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            preparedBy: event.target.value,
                          }));
                          setSubmitError("");
                        }}
                      />
                    </label>
                  </div>

                  <label className="form-field">
                    <span>
                      Approved by
                      {form.status === "final" ? <strong> *</strong> : null}
                    </span>
                    <input
                      type="text"
                      value={form.approvedBy}
                      disabled={isSubmitting}
                      placeholder="Approver name for final packages"
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          approvedBy: event.target.value,
                        }));
                        setSubmitError("");
                      }}
                    />
                  </label>

                  <label className="form-field turnover-notes-field">
                    <span>Package notes</span>
                    <textarea
                      value={form.notes}
                      disabled={isSubmitting}
                      placeholder="Turnover conditions, limitations, or included scope notes"
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }));
                        setSubmitError("");
                      }}
                    />
                  </label>

                  {submitError && (
                    <p className="form-submit-error" role="alert">
                      {submitError}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="modal-footer turnover-modal-footer">
            <button
              className="secondary-button"
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={
                isSubmitting ||
                !hasAnyScope ||
                !preflight ||
                isLoadingPreflight
              }
            >
              {isSubmitting ? "Creating package..." : "Create package"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default TurnoverPackageModal;
