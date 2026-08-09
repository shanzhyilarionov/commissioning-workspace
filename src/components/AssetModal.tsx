import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import type {
  Asset,
  AssetInput,
  AssetStatus,
} from "../types/asset";
import type {
  CommissioningSystem,
  Subsystem,
} from "../types/system";

interface AssetModalProps {
  isOpen: boolean;
  asset: Asset | null;
  systems: CommissioningSystem[];
  subsystems: Subsystem[];
  onClose: () => void;
  onSave: (input: AssetInput) => Promise<void>;
}

const NEW_OPTION = "__new__";

const emptyForm: AssetInput = {
  systemId: null,
  subsystemId: null,
  systemName: "",
  subsystemName: "",
  tag: "",
  name: "",
  assetType: "",
  status: "not_started",
  description: "",
};

function AssetModal({
  isOpen,
  asset,
  systems,
  subsystems,
  onClose,
  onSave,
}: AssetModalProps) {
  const [form, setForm] = useState<AssetInput>(emptyForm);
  const [isCreatingSystem, setIsCreatingSystem] = useState(false);
  const [isCreatingSubsystem, setIsCreatingSubsystem] = useState(false);
  const [tagError, setTagError] = useState("");
  const [nameError, setNameError] = useState("");
  const [systemError, setSystemError] = useState("");
  const [subsystemError, setSubsystemError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableSubsystems = useMemo(
    () =>
      form.systemId
        ? subsystems.filter(
            (subsystem) => subsystem.systemId === form.systemId,
          )
        : [],
    [form.systemId, subsystems],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (asset) {
      setForm({
        systemId: asset.systemId,
        subsystemId: asset.subsystemId,
        systemName: asset.systemName,
        subsystemName: asset.subsystemName,
        tag: asset.tag,
        name: asset.name,
        assetType: asset.assetType,
        status: asset.status,
        description: asset.description,
      });
      setIsCreatingSystem(
        Boolean(asset.systemName && !asset.systemId),
      );
      setIsCreatingSubsystem(
        Boolean(asset.subsystemName && !asset.subsystemId),
      );
    } else {
      setForm(emptyForm);
      setIsCreatingSystem(false);
      setIsCreatingSubsystem(false);
    }

    setTagError("");
    setNameError("");
    setSystemError("");
    setSubsystemError("");
    setSubmitError("");
  }, [isOpen, asset]);

  if (!isOpen) {
    return null;
  }

  const isEditing = asset !== null;
  const systemSelectValue = isCreatingSystem
    ? NEW_OPTION
    : form.systemId ?? "";
  const subsystemSelectValue = isCreatingSubsystem
    ? NEW_OPTION
    : form.subsystemId ?? "";

  function clearSubmitError() {
    if (submitError) {
      setSubmitError("");
    }
  }

  function handleClose() {
    if (isSubmitting) {
      return;
    }

    onClose();
  }

  function handleSystemChange(value: string) {
    setSystemError("");
    setSubsystemError("");
    clearSubmitError();

    if (value === NEW_OPTION) {
      setIsCreatingSystem(true);
      setIsCreatingSubsystem(false);
      setForm((current) => ({
        ...current,
        systemId: null,
        subsystemId: null,
        systemName: "",
        subsystemName: "",
      }));
      return;
    }

    if (!value) {
      setIsCreatingSystem(false);
      setIsCreatingSubsystem(false);
      setForm((current) => ({
        ...current,
        systemId: null,
        subsystemId: null,
        systemName: "",
        subsystemName: "",
      }));
      return;
    }

    const selectedSystem = systems.find(
      (system) => system.id === value,
    );

    setIsCreatingSystem(false);
    setIsCreatingSubsystem(false);
    setForm((current) => ({
      ...current,
      systemId: value,
      subsystemId: null,
      systemName: selectedSystem?.name ?? "",
      subsystemName: "",
    }));
  }

  function handleSubsystemChange(value: string) {
    setSubsystemError("");
    clearSubmitError();

    if (value === NEW_OPTION) {
      setIsCreatingSubsystem(true);
      setForm((current) => ({
        ...current,
        subsystemId: null,
        subsystemName: "",
      }));
      return;
    }

    if (!value) {
      setIsCreatingSubsystem(false);
      setForm((current) => ({
        ...current,
        subsystemId: null,
        subsystemName: "",
      }));
      return;
    }

    const selectedSubsystem = availableSubsystems.find(
      (subsystem) => subsystem.id === value,
    );

    setIsCreatingSubsystem(false);
    setForm((current) => ({
      ...current,
      subsystemId: value,
      subsystemName: selectedSubsystem?.name ?? "",
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const tag = form.tag.trim();
    const name = form.name.trim();
    const systemName = form.systemName.trim();
    const subsystemName = form.subsystemName.trim();

    let hasError = false;

    if (!tag) {
      setTagError("Asset tag is required.");
      hasError = true;
    }

    if (!name) {
      setNameError("Asset name is required.");
      hasError = true;
    }

    if (isCreatingSystem && !systemName) {
      setSystemError("System name is required.");
      hasError = true;
    }

    if (isCreatingSubsystem && !subsystemName) {
      setSubsystemError("Subsystem name is required.");
      hasError = true;
    }

    if (hasError) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      await onSave({
        systemId: isCreatingSystem ? null : form.systemId,
        subsystemId:
          isCreatingSystem || isCreatingSubsystem
            ? null
            : form.subsystemId,
        systemName,
        subsystemName,
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

                    clearSubmitError();
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
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      assetType: event.target.value,
                    }));
                    clearSubmitError();
                  }}
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

                  clearSubmitError();
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
                <select
                  value={systemSelectValue}
                  disabled={isSubmitting}
                  className={systemError ? "input-error" : ""}
                  onChange={(event) =>
                    handleSystemChange(event.target.value)
                  }
                >
                  <option value="">No system</option>
                  {systems.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.name}
                    </option>
                  ))}
                  <option value={NEW_OPTION}>New system…</option>
                </select>

                {isCreatingSystem && (
                  <input
                    type="text"
                    value={form.systemName}
                    disabled={isSubmitting}
                    className={systemError ? "input-error" : ""}
                    placeholder="Cooling Water"
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        systemName: event.target.value,
                      }));
                      setSystemError("");
                      clearSubmitError();
                    }}
                  />
                )}

                {systemError && (
                  <small className="field-error">
                    {systemError}
                  </small>
                )}
              </label>

              <label className="form-field">
                <span>Subsystem</span>
                {isCreatingSystem ? (
                  <input
                    type="text"
                    value={form.subsystemName}
                    disabled={isSubmitting}
                    placeholder="Main Pumps"
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        subsystemName: event.target.value,
                      }));
                      setSubsystemError("");
                      clearSubmitError();
                    }}
                  />
                ) : (
                  <>
                    <select
                      value={subsystemSelectValue}
                      disabled={isSubmitting || !form.systemId}
                      className={subsystemError ? "input-error" : ""}
                      onChange={(event) =>
                        handleSubsystemChange(event.target.value)
                      }
                    >
                      <option value="">
                        {form.systemId
                          ? "No subsystem"
                          : "Select a system first"}
                      </option>
                      {availableSubsystems.map((subsystem) => (
                        <option
                          key={subsystem.id}
                          value={subsystem.id}
                        >
                          {subsystem.name}
                        </option>
                      ))}
                      {form.systemId && (
                        <option value={NEW_OPTION}>
                          New subsystem…
                        </option>
                      )}
                    </select>

                    {isCreatingSubsystem && (
                      <input
                        type="text"
                        value={form.subsystemName}
                        disabled={isSubmitting}
                        className={
                          subsystemError ? "input-error" : ""
                        }
                        placeholder="Main Pumps"
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            subsystemName: event.target.value,
                          }));
                          setSubsystemError("");
                          clearSubmitError();
                        }}
                      />
                    )}
                  </>
                )}

                {subsystemError && (
                  <small className="field-error">
                    {subsystemError}
                  </small>
                )}
              </label>
            </div>

            <label className="form-field">
              <span>Status</span>
              <select
                value={form.status}
                disabled={isSubmitting}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as AssetStatus,
                  }));
                  clearSubmitError();
                }}
              >
                <option value="not_started">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>

            <label className="form-field">
              <span>Description</span>
              <textarea
                rows={4}
                value={form.description}
                disabled={isSubmitting}
                placeholder="Optional equipment or commissioning notes"
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }));
                  clearSubmitError();
                }}
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
