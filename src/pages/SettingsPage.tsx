import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import ProjectExportModal from "../components/ProjectExportModal";
import {
  chooseAndCreateProjectPackage,
  chooseAndInspectProjectPackage,
  importProjectPackage,
  revealProjectPackage,
} from "../services/projectTransferService";
import {
  chooseAndCreateWorkspaceBackup,
  chooseAndInspectWorkspaceBackup,
  clearWorkspace,
  getAutomaticBackupPreferences,
  getAutomaticWorkspaceBackupStatus,
  openWorkspaceBackupDirectory,
  restoreWorkspaceBackup,
  revealBackup,
  runAutomaticWorkspaceBackup,
  saveAutomaticBackupPreferences,
} from "../services/workspaceBackupService";
import {
  getCurrentOperator,
  setCurrentOperator,
} from "../repositories/auditRepository";
import type { Project } from "../types/project";
import type {
  ProjectPackageImportSummary,
  ProjectPackageInspection,
  ProjectPackageSummary,
} from "../types/projectTransfer";
import type {
  AutomaticBackupPreferences,
  AutomaticBackupStatus,
  WorkspaceBackupInspection,
  WorkspaceBackupSummary,
} from "../types/workspaceBackup";
import type { AppTheme } from "../theme";
import "./SettingsPage.css";

interface SettingsPageProps {
  projects: Project[];
  theme: AppTheme;
  onOperatorNameChange: (operatorName: string) => void;
  onProjectsImported: () => Promise<void>;
  onThemeChange: (theme: AppTheme) => void;
  onWorkspaceCleared: () => void;
  onWorkspaceRestored: () => Promise<void>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : String(error || fallback);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function projectCountLabel(count: number): string {
  return `${count} ${count === 1 ? "project" : "projects"}`;
}

function SettingsPage({
  projects,
  theme,
  onOperatorNameChange,
  onProjectsImported,
  onThemeChange,
  onWorkspaceCleared,
  onWorkspaceRestored,
}: SettingsPageProps) {
  const [operatorName, setOperatorName] = useState("");
  const [savedOperatorName, setSavedOperatorName] = useState("");
  const [isSavingOperator, setIsSavingOperator] = useState(false);
  const [operatorError, setOperatorError] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isInspectingImport, setIsInspectingImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<ProjectPackageSummary | null>(
    null,
  );
  const [lastImport, setLastImport] =
    useState<ProjectPackageImportSummary | null>(null);
  const [selectedImport, setSelectedImport] =
    useState<ProjectPackageInspection | null>(null);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isInspectingBackup, setIsInspectingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [lastBackup, setLastBackup] =
    useState<WorkspaceBackupSummary | null>(null);
  const [selectedBackup, setSelectedBackup] =
    useState<WorkspaceBackupInspection | null>(null);
  const [automaticBackupPreferences, setAutomaticBackupPreferences] =
    useState<AutomaticBackupPreferences>(getAutomaticBackupPreferences);
  const [automaticBackupStatus, setAutomaticBackupStatus] =
    useState<AutomaticBackupStatus | null>(null);
  const [isUpdatingAutomaticBackups, setIsUpdatingAutomaticBackups] =
    useState(false);
  const [automaticBackupError, setAutomaticBackupError] =
    useState<string | null>(null);
  const [isClearWorkspaceModalOpen, setIsClearWorkspaceModalOpen] =
    useState(false);
  const [clearWorkspaceConfirmation, setClearWorkspaceConfirmation] =
    useState("");
  const [isClearingWorkspace, setIsClearingWorkspace] = useState(false);
  const [clearWorkspaceError, setClearWorkspaceError] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOperator() {
      try {
        const storedOperator = await getCurrentOperator();
        if (!cancelled) {
          setOperatorName(storedOperator);
          setSavedOperatorName(storedOperator);
        }
      } catch (error) {
        if (!cancelled) {
          setOperatorError(
            errorMessage(error, "Failed to load the current operator."),
          );
        }
      }
    }

    void loadOperator();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAutomaticBackupStatus() {
      try {
        const status = await getAutomaticWorkspaceBackupStatus();
        if (!cancelled) {
          setAutomaticBackupStatus(status);
        }
      } catch (error) {
        if (!cancelled) {
          setAutomaticBackupError(
            errorMessage(error, "Failed to load automatic backup status."),
          );
        }
      }
    }

    void loadAutomaticBackupStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateAutomaticBackupPreferences(
    next: AutomaticBackupPreferences,
  ) {
    setAutomaticBackupPreferences(next);
    saveAutomaticBackupPreferences(next);
    setAutomaticBackupError(null);

    if (!next.enabled) {
      return;
    }

    setIsUpdatingAutomaticBackups(true);
    try {
      setAutomaticBackupStatus(await runAutomaticWorkspaceBackup(next));
    } catch (error) {
      setAutomaticBackupError(
        errorMessage(error, "Failed to update automatic backups."),
      );
    } finally {
      setIsUpdatingAutomaticBackups(false);
    }
  }

  async function handleSaveOperator(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isSavingOperator) {
      return;
    }

    setIsSavingOperator(true);
    setOperatorError(null);

    try {
      const savedOperator = await setCurrentOperator(operatorName);
      setOperatorName(savedOperator);
      setSavedOperatorName(savedOperator);
      onOperatorNameChange(savedOperator);
    } catch (error) {
      setOperatorError(
        errorMessage(error, "Failed to save the current operator."),
      );
    } finally {
      setIsSavingOperator(false);
    }
  }

  async function handleExportProjects(projectIds: string[]) {
    if (isExporting) {
      return;
    }

    setIsExporting(true);
    setExportError(null);
    setTransferError(null);

    try {
      const result = await chooseAndCreateProjectPackage(projectIds);
      if (result) {
        setLastExport(result);
        setIsExportModalOpen(false);
      }
    } catch (error) {
      setExportError(errorMessage(error, "Failed to export the selected projects."));
    } finally {
      setIsExporting(false);
    }
  }

  async function handleSelectImport() {
    if (isInspectingImport || isImporting) {
      return;
    }

    setIsInspectingImport(true);
    setTransferError(null);
    setImportError(null);

    try {
      const inspection = await chooseAndInspectProjectPackage();
      if (!inspection) {
        return;
      }
      if (!inspection.compatible) {
        setTransferError(
          `This package uses schema version ${inspection.schemaVersion}, but this application requires the current schema.`,
        );
        return;
      }
      setSelectedImport(inspection);
    } catch (error) {
      setTransferError(
        errorMessage(error, "Failed to validate the selected project package."),
      );
    } finally {
      setIsInspectingImport(false);
    }
  }

  function handleCloseImportConfirmation() {
    if (!isImporting) {
      setSelectedImport(null);
      setImportError(null);
    }
  }

  async function handleConfirmImport() {
    if (!selectedImport || isImporting) {
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setTransferError(null);

    try {
      const result = await importProjectPackage(selectedImport);
      setLastImport(result);
      setSelectedImport(null);
      try {
        await onProjectsImported();
      } catch (error) {
        setTransferError(
          errorMessage(
            error,
            "The projects were imported, but the project list could not be refreshed.",
          ),
        );
      }
    } catch (error) {
      setImportError(errorMessage(error, "Failed to import the project package."));
    } finally {
      setIsImporting(false);
    }
  }

  async function handleRevealProjectPackage(path: string) {
    setTransferError(null);
    try {
      await revealProjectPackage(path);
    } catch (error) {
      setTransferError(errorMessage(error, "Failed to show the project package."));
    }
  }

  async function handleCreateBackup() {
    if (isCreatingBackup) {
      return;
    }

    setIsCreatingBackup(true);
    setBackupError(null);

    try {
      const result = await chooseAndCreateWorkspaceBackup();
      if (result) {
        setLastBackup(result);
      }
    } catch (error) {
      setBackupError(errorMessage(error, "Failed to create the workspace backup."));
    } finally {
      setIsCreatingBackup(false);
    }
  }

  async function handleSelectBackup() {
    if (isInspectingBackup) {
      return;
    }

    setIsInspectingBackup(true);
    setRestoreError(null);

    try {
      const inspection = await chooseAndInspectWorkspaceBackup();
      if (inspection) {
        if (!inspection.compatible) {
          setRestoreError(
            `This backup uses schema version ${inspection.schemaVersion}, which is newer than this application supports.`,
          );
          return;
        }
        setSelectedBackup(inspection);
      }
    } catch (error) {
      setRestoreError(errorMessage(error, "Failed to validate the selected backup."));
    } finally {
      setIsInspectingBackup(false);
    }
  }

  async function handleRevealBackup(path: string) {
    setBackupError(null);
    try {
      await revealBackup(path);
    } catch (error) {
      setBackupError(errorMessage(error, "Failed to show the backup file."));
    }
  }

  async function handleOpenBackupFolder() {
    setBackupError(null);
    try {
      await openWorkspaceBackupDirectory();
    } catch (error) {
      setBackupError(errorMessage(error, "Failed to open the backup folder."));
    }
  }

  function handleCloseRestoreConfirmation() {
    if (!isRestoringBackup) {
      setSelectedBackup(null);
      setRestoreError(null);
    }
  }

  async function handleConfirmRestore() {
    if (!selectedBackup || isRestoringBackup) {
      return;
    }

    setIsRestoringBackup(true);
    setRestoreError(null);

    try {
      await restoreWorkspaceBackup(selectedBackup);
    } catch (error) {
      setRestoreError(errorMessage(error, "Failed to restore the workspace backup."));
      setIsRestoringBackup(false);
      return;
    }

    try {
      await onWorkspaceRestored();
    } catch (error) {
      setRestoreError(
        errorMessage(
          error,
          "The workspace was restored, but the interface could not reload it. Close and reopen the application to continue.",
        ),
      );
      setIsRestoringBackup(false);
    }
  }

  function handleCloseClearWorkspaceConfirmation() {
    if (!isClearingWorkspace) {
      setIsClearWorkspaceModalOpen(false);
      setClearWorkspaceConfirmation("");
      setClearWorkspaceError(null);
    }
  }

  async function handleConfirmClearWorkspace() {
    if (
      isClearingWorkspace ||
      clearWorkspaceConfirmation !== "CLEAR WORKSPACE"
    ) {
      return;
    }

    setIsClearingWorkspace(true);
    setClearWorkspaceError(null);

    try {
      await clearWorkspace();
    } catch (error) {
      setClearWorkspaceError(
        errorMessage(error, "Failed to clear the workspace."),
      );
      setIsClearingWorkspace(false);
      return;
    }

    try {
      onWorkspaceCleared();
    } catch (error) {
      setClearWorkspaceError(
        errorMessage(
          error,
          "The workspace was cleared, but the interface could not refresh. Close and reopen the application to continue.",
        ),
      );
      setIsClearingWorkspace(false);
    }
  }

  const recoveryBusy =
    isCreatingBackup ||
    isInspectingBackup ||
    isRestoringBackup ||
    isClearingWorkspace;

  return (
    <>
      <section className="content-card section-card settings-page">
        <div className="projects-header settings-header">
          <div>
            <h3>Settings</h3>
          </div>
        </div>

        <div className="settings-scroll-container">
          <div className="settings-content">
            <section className="settings-group">
              <div className="settings-group-heading">
                <h4>Appearance</h4>
              </div>

              <div className="settings-appearance-card">
                <p>
                  Choose the interface appearance used throughout the
                  application.
                </p>
                <div
                  className="settings-theme-selector"
                  role="group"
                  aria-label="Application theme"
                >
                  <button
                    type="button"
                    className={
                      theme === "system"
                        ? "settings-theme-option active"
                        : "settings-theme-option"
                    }
                    aria-pressed={theme === "system"}
                    onClick={() => onThemeChange("system")}
                  >
                    System
                  </button>
                  <button
                    type="button"
                    className={
                      theme === "light"
                        ? "settings-theme-option active"
                        : "settings-theme-option"
                    }
                    aria-pressed={theme === "light"}
                    onClick={() => onThemeChange("light")}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    className={
                      theme === "dark"
                        ? "settings-theme-option active"
                        : "settings-theme-option"
                    }
                    aria-pressed={theme === "dark"}
                    onClick={() => onThemeChange("dark")}
                  >
                    Dark
                  </button>
                </div>
              </div>
            </section>

            <section className="settings-group">
              <div className="settings-group-heading">
                <h4>Identity</h4>
              </div>

              <form
                className="settings-identity-card"
                onSubmit={(event) => void handleSaveOperator(event)}
              >
                <div>
                  <p>
                    This name is recorded as the default operator for audit
                    events and controlled workflow actions, and is used in
                    the Home greeting.
                  </p>
                </div>
                <input
                  className="settings-identity-input"
                  type="text"
                  value={operatorName}
                  disabled={isSavingOperator}
                  placeholder="Technician, engineer, or approver"
                  aria-label="Current operator"
                  onChange={(event) => {
                    setOperatorName(event.target.value);
                    setOperatorError(null);
                  }}
                />
                <button
                  type="submit"
                  className="secondary-button settings-card-button"
                  disabled={
                    isSavingOperator ||
                    operatorName.trim() === savedOperatorName
                  }
                >
                  {isSavingOperator
                    ? operatorName.trim()
                      ? "Saving..."
                      : "Clearing..."
                    : operatorName.trim()
                      ? "Save operator"
                      : "Clear operator"}
                </button>
              </form>

              {operatorError && (
                <p
                  className="settings-message settings-message-error"
                  role="alert"
                >
                  {operatorError}
                </p>
              )}
            </section>

            <section className="settings-group">
              <div className="settings-group-heading">
                <h4>Project data</h4>
              </div>

              <div className="settings-transfer-panel">
                <section className="settings-action-card">
                  <div>
                    <p>
                      Choose one, several, or all projects and save their records
                      and managed documents in one .cwp package.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button settings-card-button"
                    disabled={projects.length === 0 || isImporting}
                    onClick={() => {
                      setExportError(null);
                      setIsExportModalOpen(true);
                    }}
                  >
                    Export projects
                  </button>
                </section>

                <section className="settings-action-card">
                  <div>
                    <p>
                      Add projects from a .cwp package. Existing projects stay
                      unchanged and imported records receive new IDs.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button settings-card-button"
                    disabled={isInspectingImport || isImporting || isExporting}
                    onClick={() => void handleSelectImport()}
                  >
                    {isInspectingImport ? "Validating..." : "Import package"}
                  </button>
                </section>
              </div>

              {transferError && (
                <p className="settings-message settings-message-error" role="alert">
                  {transferError}
                </p>
              )}

              {lastExport && (
                <div className="settings-result" role="status">
                  <div>
                    <strong>Project package created</strong>
                    <span>
                      {projectCountLabel(lastExport.projects.length)} ·{" "}
                      {lastExport.fileCount} files · {formatBytes(lastExport.totalBytes)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void handleRevealProjectPackage(lastExport.path)}
                  >
                    Show file
                  </button>
                </div>
              )}

              {lastImport && (
                <div className="settings-result" role="status">
                  <div>
                    <strong>Projects imported</strong>
                    <span>
                      {lastImport.projects.map((project) => project.name).join(", ")}
                    </span>
                  </div>
                  <span className="settings-result-meta">
                    {formatDateTime(lastImport.importedAt)}
                  </span>
                </div>
              )}
            </section>

            <section className="settings-group">
              <div className="settings-group-heading">
                <h4>Workspace recovery</h4>
              </div>

              <section className="settings-recovery-panel">
                <div className="settings-automatic-backup">
                  <div className="settings-automatic-backup-copy">
                    <p>
                      Create a backup after the selected interval when the
                      workspace has changed.
                    </p>
                    <span>
                      {automaticBackupStatus?.lastBackup
                        ? `Last automatic backup: ${formatDateTime(
                            automaticBackupStatus.lastBackup.createdAt,
                          )}`
                        : "No automatic backup has been created yet."}
                    </span>
                  </div>

                  <div className="settings-automatic-backup-controls">
                    <div className="settings-backup-field settings-backup-toggle-field">
                      <span>Auto backup</span>
                      <div
                        className="settings-binary-selector"
                        role="group"
                        aria-label="Automatic backups"
                      >
                        <button
                          type="button"
                          className={
                            automaticBackupPreferences.enabled
                              ? "settings-theme-option active"
                              : "settings-theme-option"
                          }
                          aria-pressed={automaticBackupPreferences.enabled}
                          disabled={isUpdatingAutomaticBackups}
                          onClick={() =>
                            void updateAutomaticBackupPreferences({
                              ...automaticBackupPreferences,
                              enabled: true,
                            })
                          }
                        >
                          On
                        </button>
                        <button
                          type="button"
                          className={
                            !automaticBackupPreferences.enabled
                              ? "settings-theme-option active"
                              : "settings-theme-option"
                          }
                          aria-pressed={!automaticBackupPreferences.enabled}
                          disabled={isUpdatingAutomaticBackups}
                          onClick={() =>
                            void updateAutomaticBackupPreferences({
                              ...automaticBackupPreferences,
                              enabled: false,
                            })
                          }
                        >
                          Off
                        </button>
                      </div>
                    </div>

                    <label className="settings-backup-field">
                      <span>Frequency</span>
                      <select
                        value={automaticBackupPreferences.frequency}
                        disabled={
                          !automaticBackupPreferences.enabled ||
                          isUpdatingAutomaticBackups
                        }
                        onChange={(event) =>
                          void updateAutomaticBackupPreferences({
                            ...automaticBackupPreferences,
                            frequency: event.target.value as
                              AutomaticBackupPreferences["frequency"],
                          })
                        }
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </label>

                    <label className="settings-backup-field">
                      <span>Keep</span>
                      <select
                        value={automaticBackupPreferences.retentionCount}
                        disabled={
                          !automaticBackupPreferences.enabled ||
                          isUpdatingAutomaticBackups
                        }
                        onChange={(event) =>
                          void updateAutomaticBackupPreferences({
                            ...automaticBackupPreferences,
                            retentionCount: Number(event.target.value),
                          })
                        }
                      >
                        <option value={5}>5 backups</option>
                        <option value={10}>10 backups</option>
                        <option value={20}>20 backups</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="settings-recovery-action">
                  <div>
                    <p>Save the complete database and every managed document.</p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button settings-card-button"
                    disabled={recoveryBusy || isImporting || isExporting}
                    onClick={() => void handleCreateBackup()}
                  >
                    {isCreatingBackup ? "Creating..." : "Create backup"}
                  </button>
                </div>

                <div className="settings-recovery-action">
                  <div>
                    <p>Replace the entire workspace after creating a safety copy.</p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button settings-card-button"
                    disabled={recoveryBusy || isImporting || isExporting}
                    onClick={() => void handleSelectBackup()}
                  >
                    {isInspectingBackup ? "Validating..." : "Restore backup"}
                  </button>
                </div>

                <div className="settings-recovery-action">
                  <div>
                    <p>Open the automatic and safety backup directory.</p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button settings-card-button"
                    disabled={isRestoringBackup}
                    onClick={() => void handleOpenBackupFolder()}
                  >
                    Open folder
                  </button>
                </div>

                {(automaticBackupError ||
                  backupError ||
                  (restoreError && !selectedBackup)) && (
                  <p className="settings-message settings-message-error" role="alert">
                    {automaticBackupError || backupError || restoreError}
                  </p>
                )}

                {lastBackup && (
                  <div className="settings-result settings-recovery-result" role="status">
                    <div>
                      <strong>Backup created</strong>
                      <span>
                        {formatDateTime(lastBackup.createdAt)} ·{" "}
                        {lastBackup.fileCount} files ·{" "}
                        {formatBytes(lastBackup.totalBytes)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void handleRevealBackup(lastBackup.path)}
                    >
                      Show file
                    </button>
                  </div>
                )}
              </section>
            </section>

            <section className="settings-group">
              <div className="settings-group-heading">
                <h4>Danger zone</h4>
              </div>

              <section className="settings-danger-panel">
                <div>
                  <p>
                    Remove every project, record, audit event, revision, and
                    managed document. A verified safety backup is created first.
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary-button settings-card-button"
                  disabled={
                    recoveryBusy ||
                    isInspectingImport ||
                    isImporting ||
                    isExporting ||
                    isSavingOperator ||
                    isUpdatingAutomaticBackups
                  }
                  onClick={() => {
                    setClearWorkspaceConfirmation("");
                    setClearWorkspaceError(null);
                    setIsClearWorkspaceModalOpen(true);
                  }}
                >
                  Clear workspace
                </button>
              </section>
            </section>
          </div>
        </div>
      </section>

      <ProjectExportModal
        isOpen={isExportModalOpen}
        projects={projects}
        isExporting={isExporting}
        error={exportError}
        onClose={() => {
          if (!isExporting) {
            setIsExportModalOpen(false);
            setExportError(null);
          }
        }}
        onExport={(projectIds) => void handleExportProjects(projectIds)}
      />

      <DeleteConfirmationModal
        isOpen={selectedImport !== null}
        title="Import project package?"
        message={
          selectedImport ? (
            <div className="restore-confirmation-content">
              <p>
                These projects will be added to the workspace. Existing projects
                and records will not be changed.
              </p>
              <dl className="restore-backup-details">
                <div>
                  <dt>Created</dt>
                  <dd>{formatDateTime(selectedImport.createdAt)}</dd>
                </div>
                <div>
                  <dt>Projects</dt>
                  <dd>{projectCountLabel(selectedImport.projects.length)}</dd>
                </div>
                <div>
                  <dt>Names</dt>
                  <dd>
                    {selectedImport.projects.map((project) => project.name).join(", ")}
                  </dd>
                </div>
                <div>
                  <dt>Contents</dt>
                  <dd>
                    {selectedImport.fileCount} files ·{" "}
                    {formatBytes(selectedImport.totalBytes)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null
        }
        confirmLabel="Import projects"
        submittingLabel="Importing..."
        isSubmitting={isImporting}
        error={importError}
        confirmTone="primary"
        onClose={handleCloseImportConfirmation}
        onConfirm={() => void handleConfirmImport()}
      />

      <DeleteConfirmationModal
        isOpen={selectedBackup !== null}
        title="Restore workspace backup?"
        message={
          selectedBackup ? (
            <div className="restore-confirmation-content">
              <p>
                This will replace all current projects, records, settings, and
                managed documents. The restored workspace will open when the
                restore is complete.
              </p>
              <dl className="restore-backup-details">
                <div>
                  <dt>Created</dt>
                  <dd>{formatDateTime(selectedBackup.createdAt)}</dd>
                </div>
                <div>
                  <dt>App version</dt>
                  <dd>{selectedBackup.applicationVersion}</dd>
                </div>
                <div>
                  <dt>Schema</dt>
                  <dd>{selectedBackup.schemaVersion}</dd>
                </div>
                <div>
                  <dt>Contents</dt>
                  <dd>
                    {selectedBackup.fileCount} files ·{" "}
                    {formatBytes(selectedBackup.totalBytes)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null
        }
        confirmLabel="Restore workspace"
        submittingLabel="Restoring..."
        isSubmitting={isRestoringBackup}
        error={restoreError}
        onClose={handleCloseRestoreConfirmation}
        onConfirm={() => void handleConfirmRestore()}
      />

      <DeleteConfirmationModal
        isOpen={isClearWorkspaceModalOpen}
        title="Clear the entire workspace?"
        message={
          <div className="clear-workspace-confirmation-content">
            <p>
              This permanently removes all projects, records, audit history,
              revisions, the current operator, and managed documents from this
              device. Theme and automatic backup preferences remain unchanged.
            </p>
            <p>
              A verified safety backup will be created before anything is
              removed.
            </p>
            <label className="clear-workspace-confirmation-field">
              <span>
                Type <strong>CLEAR WORKSPACE</strong> to confirm
              </span>
              <input
                type="text"
                value={clearWorkspaceConfirmation}
                disabled={isClearingWorkspace}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setClearWorkspaceConfirmation(event.target.value);
                  setClearWorkspaceError(null);
                }}
              />
            </label>
          </div>
        }
        confirmLabel="Clear workspace"
        submittingLabel="Creating backup & clearing..."
        isSubmitting={isClearingWorkspace}
        error={clearWorkspaceError}
        confirmDisabled={clearWorkspaceConfirmation !== "CLEAR WORKSPACE"}
        onClose={handleCloseClearWorkspaceConfirmation}
        onConfirm={() => void handleConfirmClearWorkspace()}
      />
    </>
  );
}

export default SettingsPage;
