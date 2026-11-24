import { useCallback, useEffect, useMemo, useState } from "react";
import ActionMenu from "../components/ActionMenu";
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import FixedHeaderTable from "../components/FixedHeaderTable";
import ListToolbar from "../components/ListToolbar";
import TablePage from "../components/TablePage";
import ReadinessReviewModal from "../components/ReadinessReviewModal";
import StructureEditorModal from "../components/StructureEditorModal";
import { listAssetsByProject } from "../repositories/assetRepository";
import {
  getStructureReadinessReview,
  listStructureReadinessSummaries,
  transitionStructureStage,
} from "../repositories/readinessRepository";
import {
  createSubsystemDetails,
  createSystemDetails,
  deleteSubsystem,
  deleteSystem,
  listSubsystemsByProject,
  listSystemsByProject,
  updateSubsystem,
  updateSystem,
} from "../repositories/systemRepository";
import { getProjectStructureProgress } from "../repositories/systemProgressRepository";
import type { Asset } from "../types/asset";
import type { Project } from "../types/project";
import type {
  AttentionDestinationPage,
  ProjectNavigationItem,
} from "../types/navigation";
import type {
  ReadinessBlocker,
  StageTransitionInput,
  StructureKind,
  StructureReadinessReview,
  StructureReadinessSummary,
} from "../types/readiness";
import type {
  CommissioningStage,
  CommissioningSystem,
  StructureInput,
  Subsystem,
} from "../types/system";
import type {
  CommissioningReadiness,
  ProjectStructureProgress,
  StructureProgress,
} from "../types/systemProgress";

interface SystemManagementPageProps {
  currentProject: Project;
  selectedSystemId: string | null;
  onSelectSystem: (systemId: string | null) => void;
  onViewAssets: (
    systemId: string | null,
    returnSystemId?: string,
  ) => void;
  onNavigate: (
    page: AttentionDestinationPage,
    item?: ProjectNavigationItem,
  ) => void;
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

function formatReadiness(readiness: CommissioningReadiness): string {
  switch (readiness) {
    case "not_started":
      return "Not started";
    case "in_progress":
      return "In progress";
    case "blocked":
      return "Blocked";
    case "ready":
      return "Ready";
  }
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

function StructureStatusCell({
  progress,
  blockerCount,
}: {
  progress: StructureProgress | null;
  blockerCount?: number;
}) {
  if (!progress) {
    return <span className="structure-progress-unavailable">-</span>;
  }

  const readiness =
    blockerCount === undefined
      ? progress.readiness
      : progress.assetTotal === 0
        ? "not_started"
        : blockerCount === 0
          ? "ready"
          : "blocked";

  return (
    <span className={`status-badge ${readiness}`}>
      {formatReadiness(readiness)}
    </span>
  );
}

function StructureStageCell({ stage }: { stage: CommissioningStage }) {
  return (
    <span className={`status-badge structure-stage ${stage}`}>
      {formatStage(stage)}
    </span>
  );
}

function StructureBlockerButton({
  count,
  onClick,
}: {
  count: number | undefined;
  onClick: () => void;
}) {
  if (count === undefined) {
    return <span className="structure-progress-unavailable">-</span>;
  }

  return (
    <button
      className={`structure-blocker-button ${count > 0 ? "blocked" : "clear"}`}
      type="button"
      aria-label={
        count > 0
          ? `Review ${count} readiness ${count === 1 ? "blocker" : "blockers"}`
          : "Review readiness"
      }
      onClick={onClick}
    >
      {count}
    </button>
  );
}

function SystemManagementPage({
  currentProject,
  selectedSystemId,
  onSelectSystem,
  onViewAssets,
  onNavigate,
}: SystemManagementPageProps) {
  const [{ assets, systems, subsystems }, setStructure] = useState<{
    assets: Asset[];
    systems: CommissioningSystem[];
    subsystems: Subsystem[];
  }>({ assets: [], systems: [], subsystems: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadSequence, setLoadSequence] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [editorTarget, setEditorTarget] = useState<EditorTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [projectProgress, setProjectProgress] =
    useState<ProjectStructureProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [readinessSummaries, setReadinessSummaries] = useState<
    StructureReadinessSummary[]
  >([]);
  const [reviewTarget, setReviewTarget] = useState<{
    kind: StructureKind;
    structureId: string;
  } | null>(null);
  const [readinessReview, setReadinessReview] =
    useState<StructureReadinessReview | null>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const loadStructureData = useCallback(async () => {
    const [assets, systems, subsystems] = await Promise.all([
      listAssetsByProject(currentProject.id),
      listSystemsByProject(currentProject.id),
      listSubsystemsByProject(currentProject.id),
    ]);

    return { assets, systems, subsystems };
  }, [currentProject.id]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    void loadStructureData()
      .then((structure) => {
        if (!cancelled) {
          setStructure(structure);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load systems.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadStructureData, loadSequence]);

  async function refreshStructureData() {
    setStructure(await loadStructureData());
  }

  const refreshProgress = useCallback(async () => {
    setProgressError(null);

    try {
      const [progress, summaries] = await Promise.all([
        getProjectStructureProgress(currentProject.id),
        listStructureReadinessSummaries(currentProject.id),
      ]);
      setProjectProgress(progress);
      setReadinessSummaries(summaries);
    } catch (error) {
      setProjectProgress(null);
      setReadinessSummaries([]);
      setProgressError(
        error instanceof Error
          ? error.message
          : "Failed to calculate commissioning progress.",
      );
    }
  }, [currentProject.id]);

  useEffect(() => {
    setProjectProgress(null);
    void refreshProgress();
  }, [refreshProgress, loadSequence]);

  useEffect(() => {
    setSearchQuery("");
    setOpenMenuId(null);
  }, [selectedSystemId]);

  const selectedSystem =
    systems.find((system) => system.id === selectedSystemId) ?? null;

  useEffect(() => {
    if (!isLoading && !loadError && selectedSystemId && !selectedSystem) {
      onSelectSystem(null);
      setSearchQuery("");
    }
  }, [isLoading, loadError, onSelectSystem, selectedSystem, selectedSystemId]);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;

      if (
        target instanceof Element &&
        !target.closest("[data-project-action-menu]")
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

  const subsystemProgressById = useMemo(() => {
    const progressById = new Map<string, StructureProgress>();

    for (const progress of projectProgress?.subsystems ?? []) {
      if (progress.structureId) {
        progressById.set(progress.structureId, progress);
      }
    }

    return progressById;
  }, [projectProgress]);

  const systemReadinessById = useMemo(
    () =>
      new Map(
        readinessSummaries
          .filter((summary) => summary.kind === "system")
          .map((summary) => [summary.structureId, summary]),
      ),
    [readinessSummaries],
  );

  const subsystemReadinessById = useMemo(
    () =>
      new Map(
        readinessSummaries
          .filter((summary) => summary.kind === "subsystem")
          .map((summary) => [summary.structureId, summary]),
      ),
    [readinessSummaries],
  );

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
    onSelectSystem(systemId);
  }

  function handleBackToSystems() {
    setOpenMenuId(null);
    setSearchQuery("");
    onSelectSystem(null);
  }

  const loadReadinessReview = useCallback(
    async (target: { kind: StructureKind; structureId: string }) => {
      setIsLoadingReview(true);
      setReviewError(null);

      try {
        const review = await getStructureReadinessReview(
          target.kind,
          target.structureId,
        );
        setReadinessReview(review);
      } catch (error) {
        setReadinessReview(null);
        setReviewError(
          error instanceof Error
            ? error.message
            : "Failed to load the readiness review.",
        );
      } finally {
        setIsLoadingReview(false);
      }
    },
    [],
  );

  function handleOpenReadinessReview(
    kind: StructureKind,
    structureId: string,
  ) {
    const target = { kind, structureId };
    setOpenMenuId(null);
    setReviewTarget(target);
    setReadinessReview(null);
    void loadReadinessReview(target);
  }

  function handleCloseReadinessReview() {
    if (isLoadingReview) {
      return;
    }

    setReviewTarget(null);
    setReadinessReview(null);
    setReviewError(null);
  }

  async function handleTransitionStage(input: StageTransitionInput) {
    if (!reviewTarget) {
      return;
    }

    const nextReview = await transitionStructureStage(
      reviewTarget.kind,
      reviewTarget.structureId,
      input,
    );

    setReadinessReview(nextReview);
    await refreshStructureData();
    await refreshProgress();
  }

  function handleNavigateToBlocker(blocker: ReadinessBlocker) {
    if (blocker.type === "no_assets" && reviewTarget) {
      if (reviewTarget.kind === "system") {
        onViewAssets(reviewTarget.structureId, selectedSystem?.id);
      } else if (selectedSystem) {
        onViewAssets(selectedSystem.id, selectedSystem.id);
      }

      setReviewTarget(null);
      setReadinessReview(null);
      setReviewError(null);
      return;
    }

    if (!blocker.destinationPage) {
      return;
    }

    if (!blocker.attentionType || !blocker.targetId) {
      onNavigate(blocker.destinationPage);
    } else {
      onNavigate(blocker.destinationPage, {
        id: blocker.targetId,
        type: blocker.attentionType,
        title: blocker.title,
        detail: blocker.detail,
        status: blocker.status,
        updatedAt: new Date().toISOString(),
        matchText: blocker.matchText,
        parentId: blocker.parentId,
        parentTitle: blocker.parentTitle,
      });
    }

    setReviewTarget(null);
    setReadinessReview(null);
    setReviewError(null);
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

    await refreshStructureData();
    await refreshProgress();
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
          onSelectSystem(null);
          setSearchQuery("");
        }
      } else {
        await deleteSubsystem(deleteTarget.record.id);
      }

      await refreshStructureData();
      await refreshProgress();
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

  if (isLoading) {
    return (
      <section className="content-card placeholder">
        <h3>Loading systems</h3>
        <p>Reading the commissioning structure for {currentProject.name}.</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="content-card placeholder">
        <h3>Unable to load systems</h3>
        <p>{loadError}</p>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setLoadSequence((current) => current + 1)}
        >
          Try again
        </button>
      </section>
    );
  }

  if (selectedSystem) {
    return (
      <>
        <TablePage className="system-management-card">
          <div className="projects-header test-record-page-header">
            <div className="test-record-page-heading">
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

            <div
              className="test-record-page-summary structure-page-summary"
              aria-label="System overview"
            >
              <div className="test-record-page-summary-item">
                <span>Subsystems</span>
                <strong>{selectedSubsystems.length}</strong>
              </div>
              <button
                className="test-record-page-summary-item structure-page-summary-action"
                type="button"
                aria-label={`View ${countSystemAssets(selectedSystem.id)} assets`}
                onClick={() =>
                  onViewAssets(selectedSystem.id, selectedSystem.id)
                }
              >
                <span>Assets</span>
                <strong>{countSystemAssets(selectedSystem.id)}</strong>
              </button>
              <button
                className="test-record-page-summary-item structure-page-summary-action"
                type="button"
                aria-label="Review system readiness"
                onClick={() =>
                  handleOpenReadinessReview("system", selectedSystem.id)
                }
              >
                <span>Readiness blockers</span>
                <strong
                  className={
                    systemReadinessById.get(selectedSystem.id)
                      ? systemReadinessById.get(selectedSystem.id)!.blockerCount >
                        0
                        ? "structure-page-summary-value blocked"
                        : "structure-page-summary-value clear"
                      : "structure-page-summary-value"
                  }
                >
                  {systemReadinessById.get(selectedSystem.id)?.blockerCount ??
                    "-"}
                </strong>
              </button>
            </div>
          </div>

          <ListToolbar filterCount={0}>
            <input
              className="asset-search-input"
              type="search"
              value={searchQuery}
              placeholder="Search code, subsystem, or description"
              aria-label="Search subsystems"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <span className="asset-result-count">
              {filteredSubsystems.length} of {selectedSubsystems.length}
            </span>
            <div className="list-toolbar-actions">
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
          </ListToolbar>

          {progressError && (
            <div className="structure-progress-error" role="alert">
              {progressError}
            </div>
          )}

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
                  <th>Stage</th>
                  <th>Readiness</th>
                  <th className="numeric-column">Blockers</th>
                  <th className="numeric-column">Assets</th>
                  <th aria-label="Subsystem actions" />
                </tr>
              }
              body={
                <>
                  {filteredSubsystems.map((subsystem) => (
                    <tr
                      key={subsystem.id}
                      data-navigation-id={subsystem.id}
                    >
                      <td className="structure-code-cell">
                        {subsystem.code || "-"}
                      </td>
                      <td>
                        <strong className="structure-name">
                          {subsystem.name}
                        </strong>
                      </td>
                      <td className="structure-description-cell">
                        {subsystem.description || "-"}
                      </td>
                      <td className="status-cell">
                        <StructureStageCell stage={subsystem.stage} />
                      </td>
                      <td className="status-cell">
                        <StructureStatusCell
                          progress={
                            subsystemProgressById.get(subsystem.id) ?? null
                          }
                          blockerCount={
                            subsystemReadinessById.get(subsystem.id)
                              ?.blockerCount
                          }
                        />
                      </td>
                      <td className="numeric-column">
                        <StructureBlockerButton
                          count={
                            subsystemReadinessById.get(subsystem.id)
                              ?.blockerCount
                          }
                          onClick={() =>
                            handleOpenReadinessReview(
                              "subsystem",
                              subsystem.id,
                            )
                          }
                        />
                      </td>
                      <td className="numeric-column">
                        {countSubsystemAssets(subsystem.id)}
                      </td>
                      <td className="table-action-cell">
                        <div className="project-row-actions">
                          <button
                            className="row-action-button"
                            type="button"
                            onClick={() =>
                              handleOpenReadinessReview(
                                "subsystem",
                                subsystem.id,
                              )
                            }
                          >
                            Review
                          </button>
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
                          <ActionMenu
                            ariaLabel={`More actions for ${subsystem.name}`}
                            isOpen={openMenuId === subsystem.id}
                            onOpenChange={(isOpen) =>
                              setOpenMenuId(isOpen ? subsystem.id : null)
                            }
                          >
                            <button
                              className="project-menu-item"
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                onViewAssets(
                                  selectedSystem.id,
                                  selectedSystem.id,
                                )
                              }
                            >
                              View system assets
                            </button>
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
                          </ActionMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              }
            />
          )}
        </TablePage>

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

        <ReadinessReviewModal
          review={readinessReview}
          isLoading={isLoadingReview}
          loadError={reviewError}
          onClose={handleCloseReadinessReview}
          onRetry={() => {
            if (reviewTarget) {
              void loadReadinessReview(reviewTarget);
            }
          }}
          onNavigate={handleNavigateToBlocker}
          onTransition={handleTransitionStage}
        />
      </>
    );
  }

  return (
    <>
      <TablePage className="system-management-card">
        <div className="projects-header test-record-page-header">
          <div className="test-record-page-heading">
            <h3>Systems</h3>
            <p>
              Manage the commissioning hierarchy for {currentProject.name}.
            </p>
          </div>
        </div>

        <ListToolbar filterCount={0}>
          <input
            className="asset-search-input"
            type="search"
            value={searchQuery}
            placeholder="Search code, system, or description"
            aria-label="Search systems"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <span className="asset-result-count">
            {filteredSystems.length} of {systems.length}
          </span>
          <div className="list-toolbar-actions">
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
        </ListToolbar>

        {progressError && (
          <div className="structure-progress-error" role="alert">
            {progressError}
          </div>
        )}

        {projectProgress && projectProgress.unassigned.assetTotal > 0 && (
          <div className="structure-unassigned-summary">
            <div className="structure-unassigned-copy">
              <strong>Unassigned assets</strong>
              <span>
                {projectProgress.unassigned.assetTotal} assets are not assigned
                to a system.
              </span>
            </div>
            <StructureStatusCell progress={projectProgress.unassigned} />
            <button
              className="secondary-button structure-view-assets-button"
              type="button"
              onClick={() => onViewAssets(null)}
            >
              View assets
            </button>
          </div>
        )}

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
                <th>Stage</th>
                <th className="numeric-column">Blockers</th>
                <th aria-label="System actions" />
              </tr>
            }
            body={
              <>
                {filteredSystems.map((system) => (
                  <tr
                    key={system.id}
                    className="structure-system-row"
                    data-navigation-id={system.id}
                    onClick={(event) => {
                      if (
                        event.defaultPrevented ||
                        !(event.target instanceof Element) ||
                        event.target.closest(
                          "button, a, [data-project-action-menu]",
                        )
                      ) {
                        return;
                      }

                      handleOpenSystem(system.id);
                    }}
                  >
                    <td className="structure-code-cell">
                      {system.code || "-"}
                    </td>
                    <td>
                      <button
                        className="structure-name structure-open-button"
                        type="button"
                        aria-label={`Open ${system.name}`}
                        onClick={() => handleOpenSystem(system.id)}
                      >
                        {system.name}
                      </button>
                    </td>
                    <td className="structure-description-cell">
                      {system.description || "-"}
                    </td>
                    <td className="status-cell">
                      <StructureStageCell stage={system.stage} />
                    </td>
                    <td className="numeric-column">
                      <StructureBlockerButton
                        count={
                          systemReadinessById.get(system.id)?.blockerCount
                        }
                        onClick={() =>
                          handleOpenReadinessReview("system", system.id)
                        }
                      />
                    </td>
                    <td className="table-action-cell">
                      <div className="project-row-actions">
                        <button
                          className="row-action-button"
                          type="button"
                          onClick={() =>
                            handleOpenReadinessReview("system", system.id)
                          }
                        >
                          Review
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
                        <ActionMenu
                          ariaLabel={`More actions for ${system.name}`}
                          isOpen={openMenuId === system.id}
                          onOpenChange={(isOpen) =>
                            setOpenMenuId(isOpen ? system.id : null)
                          }
                        >
                          <button
                            className="project-menu-item"
                            type="button"
                            role="menuitem"
                            onClick={() => onViewAssets(system.id)}
                          >
                            View assets
                          </button>
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
                        </ActionMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </>
            }
          />
        )}
      </TablePage>

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

      <ReadinessReviewModal
        review={readinessReview}
        isLoading={isLoadingReview}
        loadError={reviewError}
        onClose={handleCloseReadinessReview}
        onRetry={() => {
          if (reviewTarget) {
            void loadReadinessReview(reviewTarget);
          }
        }}
        onNavigate={handleNavigateToBlocker}
        onTransition={handleTransitionStage}
      />
    </>
  );
}

export default SystemManagementPage;
