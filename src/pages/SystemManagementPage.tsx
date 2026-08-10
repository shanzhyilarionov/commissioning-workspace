import { useEffect, useMemo, useState } from "react";
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import FixedHeaderTable from "../components/FixedHeaderTable";
import StructureEditorModal from "../components/StructureEditorModal";
import {
  createSubsystemDetails,
  createSystemDetails,
  deleteSubsystem,
  deleteSystem,
  updateSubsystem,
  updateSystem,
} from "../repositories/systemRepository";
import type { Asset } from "../types/asset";
import type { Project } from "../types/project";
import type {
  CommissioningSystem,
  StructureInput,
  Subsystem,
} from "../types/system";
import "./SystemManagementPage.css";

interface SystemManagementPageProps {
  currentProject: Project;
  assets: Asset[];
  systems: CommissioningSystem[];
  subsystems: Subsystem[];
  onBack: () => void;
  onStructureChanged: () => Promise<void>;
}

type EditorTarget =
  | {
      kind: "system";
      record: CommissioningSystem | null;
    }
  | {
      kind: "subsystem";
      record: Subsystem | null;
    }
  | null;

type DeleteTarget =
  | {
      kind: "system";
      record: CommissioningSystem;
    }
  | {
      kind: "subsystem";
      record: Subsystem;
    }
  | null;

function SystemManagementPage({
  currentProject,
  assets,
  systems,
  subsystems,
  onBack,
  onStructureChanged,
}: SystemManagementPageProps) {
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editorTarget, setEditorTarget] = useState<EditorTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const selectedSystem =
    systems.find((system) => system.id === selectedSystemId) ?? null;

  useEffect(() => {
    if (selectedSystemId && !selectedSystem) {
      setSelectedSystemId(null);
      setSearchQuery("");
    }
  }, [selectedSystem, selectedSystemId]);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;

      if (
        target instanceof Element &&
        !target.closest(".project-action-menu")
      ) {
        setOpenMenuId(null);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuId(null);
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, []);

  const filteredSystems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return systems;
    }

    return systems.filter((system) =>
      [system.code, system.name, system.description]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [searchQuery, systems]);

  const selectedSubsystems = useMemo(() => {
    if (!selectedSystem) {
      return [];
    }

    return subsystems.filter(
      (subsystem) => subsystem.systemId === selectedSystem.id,
    );
  }, [selectedSystem, subsystems]);

  const filteredSubsystems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return selectedSubsystems;
    }

    return selectedSubsystems.filter((subsystem) =>
      [subsystem.code, subsystem.name, subsystem.description]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [searchQuery, selectedSubsystems]);

  function countSystemAssets(systemId: string) {
    return assets.filter((asset) => asset.systemId === systemId).length;
  }

  function countSubsystemAssets(subsystemId: string) {
    return assets.filter((asset) => asset.subsystemId === subsystemId).length;
  }

  function countSystemSubsystems(systemId: string) {
    return subsystems.filter((subsystem) => subsystem.systemId === systemId)
      .length;
  }

  function handleOpenSystem(systemId: string) {
    setOpenMenuId(null);
    setSearchQuery("");
    setSelectedSystemId(systemId);
  }

  function handleBackToSystems() {
    setOpenMenuId(null);
    setSearchQuery("");
    setSelectedSystemId(null);
  }

  async function handleSaveStructure(input: StructureInput) {
    if (!editorTarget) {
      return;
    }

    if (editorTarget.kind === "system") {
      if (editorTarget.record) {
        await updateSystem(editorTarget.record.id, input);
      } else {
        await createSystemDetails(currentProject.id, input);
      }
    } else {
      if (!selectedSystem) {
        throw new Error("Select a system before creating a subsystem.");
      }

      if (editorTarget.record) {
        await updateSubsystem(editorTarget.record.id, input);
      } else {
        await createSubsystemDetails(selectedSystem.id, input);
      }
    }

    await onStructureChanged();
    setEditorTarget(null);
  }

  function handleRequestDelete(target: DeleteTarget) {
    setOpenMenuId(null);
    setDeleteError(null);
    setDeleteTarget(target);
  }

  function handleCloseDelete() {
    if (isDeleting) {
      return;
    }

    setDeleteTarget(null);
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      if (deleteTarget.kind === "system") {
        const deletedSystemId = deleteTarget.record.id;
        await deleteSystem(deletedSystemId);
        if (selectedSystemId === deletedSystemId) {
          setSelectedSystemId(null);
          setSearchQuery("");
        }
      } else {
        await deleteSubsystem(deleteTarget.record.id);
      }

      await onStructureChanged();
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : `Failed to delete the ${deleteTarget.kind}.`,
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const deleteMessage = (() => {
    if (!deleteTarget) {
      return null;
    }

    if (deleteTarget.kind === "system") {
      const subsystemCount = countSystemSubsystems(deleteTarget.record.id);
      const assetCount = countSystemAssets(deleteTarget.record.id);

      return (
        <>
          Delete system <strong>{deleteTarget.record.name}</strong>? {subsystemCount}{" "}
          {subsystemCount === 1 ? "subsystem" : "subsystems"} and {assetCount}{" "}
          {assetCount === 1 ? "asset is" : "assets are"} associated with this
          system. Its subsystems will be deleted and affected assets will become
          unassigned. This action cannot be undone.
        </>
      );
    }

    const assetCount = countSubsystemAssets(deleteTarget.record.id);

    return (
      <>
        Delete subsystem <strong>{deleteTarget.record.name}</strong>? {assetCount}{" "}
        {assetCount === 1 ? "asset is" : "assets are"} associated with this
        subsystem. Affected assets will remain in the parent system but will no
        longer have a subsystem. This action cannot be undone.
      </>
    );
  })();

  if (selectedSystem) {
    return (
      <>
        <section className="content-card section-card assets-card system-management-card">
          <div className="projects-header test-record-page-header structure-page-header">
            <div className="test-record-page-heading structure-heading-copy">
              <button
                className="back-navigation-button"
                type="button"
                onClick={handleBackToSystems}
              >
                <span aria-hidden="true">←</span>
                Back to Systems
              </button>
              <h3>{selectedSystem.name}</h3>
              <p>
                {selectedSystem.code
                  ? `${selectedSystem.code} · `
                  : ""}
                {selectedSystem.description || "Manage subsystems for this system."}
              </p>
            </div>
          </div>

          <div className="assets-toolbar structure-toolbar">
            <input
              className="asset-search-input structure-search-input"
              type="search"
              value={searchQuery}
              placeholder="Search code, subsystem, or description"
              aria-label="Search subsystems"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <span className="asset-result-count">
              {filteredSubsystems.length} of {selectedSubsystems.length}
            </span>
            <div className="structure-toolbar-actions">
              <button
                className="secondary-button toolbar-primary-button"
                type="button"
                onClick={() =>
                  setEditorTarget({
                    kind: "system",
                    record: selectedSystem,
                  })
                }
              >
                Edit system
              </button>
              <button
                className="primary-button toolbar-primary-button"
                type="button"
                onClick={() =>
                  setEditorTarget({ kind: "subsystem", record: null })
                }
              >
                New subsystem
              </button>
            </div>
          </div>

          {selectedSubsystems.length === 0 ? (
            <div className="empty-state">
              <h3>No subsystems yet</h3>
              <p>Add the first subsystem for {selectedSystem.name}.</p>
            </div>
          ) : filteredSubsystems.length === 0 ? (
            <div className="empty-state compact">
              <h3>No matching subsystems</h3>
              <p>Change the search text.</p>
            </div>
          ) : (
            <FixedHeaderTable
              className="projects-table structure-subsystems-table"
              wrapperClassName="structure-table-wrapper"
              ariaLabel={`Subsystems for ${selectedSystem.name}`}
              header={
                <tr>
                  <th>Code</th>
                  <th>Subsystem</th>
                  <th>Description</th>
                  <th>Assets</th>
                  <th aria-label="Subsystem actions" />
                </tr>
              }
              body={
                <>
                  {filteredSubsystems.map((subsystem) => (
                    <tr key={subsystem.id}>
                      <td className="structure-code-cell">
                        {subsystem.code || "—"}
                      </td>
                      <td>
                        <strong className="structure-name">
                          {subsystem.name}
                        </strong>
                      </td>
                      <td className="structure-description-cell">
                        {subsystem.description || "—"}
                      </td>
                      <td className="structure-count-cell">
                        {countSubsystemAssets(subsystem.id)}
                      </td>
                      <td className="table-action-cell">
                        <div className="project-row-actions">
                          <button
                            className="row-action-button"
                            type="button"
                            onClick={() =>
                              setEditorTarget({
                                kind: "subsystem",
                                record: subsystem,
                              })
                            }
                          >
                            Edit
                          </button>
                          <div className="project-action-menu">
                            <button
                              className="more-actions-button"
                              type="button"
                              aria-label={`More actions for ${subsystem.name}`}
                              aria-haspopup="menu"
                              aria-expanded={openMenuId === subsystem.id}
                              onClick={() =>
                                setOpenMenuId((current) =>
                                  current === subsystem.id ? null : subsystem.id,
                                )
                              }
                            >
                              ⋯
                            </button>
                            {openMenuId === subsystem.id && (
                              <div
                                className="project-action-menu-panel"
                                role="menu"
                              >
                                <button
                                  className="project-menu-item danger"
                                  type="button"
                                  role="menuitem"
                                  onClick={() =>
                                    handleRequestDelete({
                                      kind: "subsystem",
                                      record: subsystem,
                                    })
                                  }
                                >
                                  Delete subsystem
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              }
            />
          )}
        </section>

        <StructureEditorModal
          isOpen={editorTarget !== null}
          kind={editorTarget?.kind ?? "subsystem"}
          record={editorTarget?.record ?? null}
          parentSystemName={selectedSystem.name}
          onClose={() => setEditorTarget(null)}
          onSave={handleSaveStructure}
        />

        <DeleteConfirmationModal
          isOpen={deleteTarget !== null}
          title={
            deleteTarget?.kind === "system"
              ? "Delete system"
              : "Delete subsystem"
          }
          message={deleteMessage}
          confirmLabel={
            deleteTarget?.kind === "system"
              ? "Delete system"
              : "Delete subsystem"
          }
          submittingLabel="Deleting..."
          isSubmitting={isDeleting}
          error={deleteError}
          onClose={handleCloseDelete}
          onConfirm={() => {
            void handleConfirmDelete();
          }}
        />
      </>
    );
  }

  return (
    <>
      <section className="content-card section-card assets-card system-management-card">
        <div className="projects-header test-record-page-header structure-page-header">
          <div className="test-record-page-heading structure-heading-copy">
            <button
              className="back-navigation-button"
              type="button"
              onClick={onBack}
            >
              <span aria-hidden="true">←</span>
              Back to Assets
            </button>
            <h3>Systems</h3>
            <p>
              Manage the commissioning hierarchy for {currentProject.name}.
            </p>
          </div>
        </div>

        <div className="assets-toolbar structure-toolbar">
          <input
            className="asset-search-input structure-search-input"
            type="search"
            value={searchQuery}
            placeholder="Search code, system, or description"
            aria-label="Search systems"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <span className="asset-result-count">
            {filteredSystems.length} of {systems.length}
          </span>
          <div className="structure-toolbar-actions">
            <button
              className="primary-button toolbar-primary-button"
              type="button"
              onClick={() =>
                setEditorTarget({ kind: "system", record: null })
              }
            >
              New system
            </button>
          </div>
        </div>

        {systems.length === 0 ? (
          <div className="empty-state">
            <h3>No systems yet</h3>
            <p>Add the first commissioning system for this project.</p>
          </div>
        ) : filteredSystems.length === 0 ? (
          <div className="empty-state compact">
            <h3>No matching systems</h3>
            <p>Change the search text.</p>
          </div>
        ) : (
          <FixedHeaderTable
            className="projects-table structure-systems-table"
            wrapperClassName="structure-table-wrapper"
            ariaLabel="Systems"
            header={
              <tr>
                <th>Code</th>
                <th>System</th>
                <th>Description</th>
                <th>Subsystems</th>
                <th>Assets</th>
                <th aria-label="System actions" />
              </tr>
            }
            body={
              <>
                {filteredSystems.map((system) => (
                  <tr key={system.id}>
                    <td className="structure-code-cell">
                      {system.code || "—"}
                    </td>
                    <td>
                      <strong className="structure-name">{system.name}</strong>
                    </td>
                    <td className="structure-description-cell">
                      {system.description || "—"}
                    </td>
                    <td className="structure-count-cell">
                      {countSystemSubsystems(system.id)}
                    </td>
                    <td className="structure-count-cell">
                      {countSystemAssets(system.id)}
                    </td>
                    <td className="table-action-cell">
                      <div className="project-row-actions">
                        <button
                          className="row-action-button"
                          type="button"
                          onClick={() => handleOpenSystem(system.id)}
                        >
                          Open
                        </button>
                        <button
                          className="row-action-button"
                          type="button"
                          onClick={() =>
                            setEditorTarget({ kind: "system", record: system })
                          }
                        >
                          Edit
                        </button>
                        <div className="project-action-menu">
                          <button
                            className="more-actions-button"
                            type="button"
                            aria-label={`More actions for ${system.name}`}
                            aria-haspopup="menu"
                            aria-expanded={openMenuId === system.id}
                            onClick={() =>
                              setOpenMenuId((current) =>
                                current === system.id ? null : system.id,
                              )
                            }
                          >
                            ⋯
                          </button>
                          {openMenuId === system.id && (
                            <div
                              className="project-action-menu-panel"
                              role="menu"
                            >
                              <button
                                className="project-menu-item danger"
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  handleRequestDelete({
                                    kind: "system",
                                    record: system,
                                  })
                                }
                              >
                                Delete system
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </>
            }
          />
        )}
      </section>

      <StructureEditorModal
        isOpen={editorTarget !== null}
        kind={editorTarget?.kind ?? "system"}
        record={editorTarget?.record ?? null}
        onClose={() => setEditorTarget(null)}
        onSave={handleSaveStructure}
      />

      <DeleteConfirmationModal
        isOpen={deleteTarget !== null}
        title="Delete system"
        message={deleteMessage}
        confirmLabel="Delete system"
        submittingLabel="Deleting system..."
        isSubmitting={isDeleting}
        error={deleteError}
        onClose={handleCloseDelete}
        onConfirm={() => {
          void handleConfirmDelete();
        }}
      />
    </>
  );
}

export default SystemManagementPage;
