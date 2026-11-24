import { useEffect, useMemo, useState } from "react";
import ActionMenu from "../components/ActionMenu";
import AssetModal from "../components/AssetModal";
import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import FixedHeaderTable from "../components/FixedHeaderTable";
import ListToolbar from "../components/ListToolbar";
import TablePage from "../components/TablePage";
import {
  createAsset,
  deleteAsset,
  listAssetsByProject,
  updateAsset,
} from "../repositories/assetRepository";
import {
  listSubsystemsByProject,
  listSystemsByProject,
} from "../repositories/systemRepository";
import type {
  Asset,
  AssetInput,
  AssetStatus,
} from "../types/asset";
import type { Project } from "../types/project";
import {
  isAuditNavigationItem,
  type AssetStructureNavigation,
  type ProjectNavigationItem,
} from "../types/navigation";
import type {
  CommissioningSystem,
  Subsystem,
} from "../types/system";

interface AssetsPageProps {
  currentProject: Project;
  attentionItem?: ProjectNavigationItem | null;
  structureNavigation: AssetStructureNavigation | null;
  onOpenSystem: (systemId: string | null) => void;
}

type AssetStatusFilter = "all" | AssetStatus;

function formatAssetStatus(status: AssetStatus) {
  switch (status) {
    case "not_started":
      return "Not started";
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "blocked":
      return "Blocked";
  }
}

function formatAssetStructure(asset: Asset) {
  if (asset.systemName && asset.subsystemName) {
    return `${asset.systemName} / ${asset.subsystemName}`;
  }

  return asset.systemName || "-";
}

function sortAssets(assets: Asset[]) {
  return [...assets].sort((first, second) => {
    const systemComparison = first.systemName.localeCompare(
      second.systemName,
      undefined,
      { sensitivity: "base" },
    );

    if (systemComparison !== 0) {
      return systemComparison;
    }

    const subsystemComparison = first.subsystemName.localeCompare(
      second.subsystemName,
      undefined,
      { sensitivity: "base" },
    );

    if (subsystemComparison !== 0) {
      return subsystemComparison;
    }

    return first.tag.localeCompare(second.tag, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
}

function AssetsPage({
  currentProject,
  attentionItem = null,
  structureNavigation,
  onOpenSystem,
}: AssetsPageProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [systems, setSystems] = useState<CommissioningSystem[]>([]);
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [systemFilter, setSystemFilter] = useState("all");
  const [statusFilter, setStatusFilter] =
    useState<AssetStatusFilter>("all");
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);
  const [isDeletingAsset, setIsDeletingAsset] = useState(false);
  const [assetDeleteError, setAssetDeleteError] =
    useState<string | null>(null);
  const [openMenuAssetId, setOpenMenuAssetId] =
    useState<string | null>(null);

  useEffect(() => {
    setSearchQuery("");
    setSystemFilter(
      structureNavigation
        ? structureNavigation.systemId ?? "unassigned"
        : "all",
    );
    setStatusFilter("all");
    setOpenMenuAssetId(null);
  }, [structureNavigation]);

  useEffect(() => {
    if (
      attentionItem &&
      (isAuditNavigationItem(attentionItem)
        ? attentionItem.entityType === "asset"
        : attentionItem.type === "blocked_asset" ||
          attentionItem.type === "incomplete_asset")
    ) {
      setSearchQuery("");
      setSystemFilter("all");
      setStatusFilter("all");
    }
  }, [attentionItem]);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;

      if (
        target instanceof Element &&
        !target.closest("[data-project-action-menu]")
      ) {
        setOpenMenuAssetId(null);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuAssetId(null);
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectAssets() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [storedAssets, storedSystems, storedSubsystems] =
          await Promise.all([
            listAssetsByProject(currentProject.id),
            listSystemsByProject(currentProject.id),
            listSubsystemsByProject(currentProject.id),
          ]);

        if (!cancelled) {
          setAssets(sortAssets(storedAssets));
          setSystems(storedSystems);
          setSubsystems(storedSubsystems);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load assets.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    setSearchQuery("");
    setEditingAsset(null);
    setIsAssetModalOpen(false);
    setAssetToDelete(null);
    setAssetDeleteError(null);
    setOpenMenuAssetId(null);
    void loadProjectAssets();

    return () => {
      cancelled = true;
    };
  }, [currentProject.id]);

  const filteredAssets = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return assets.filter((asset) => {
      const matchesSystem =
        systemFilter === "all" ||
        (systemFilter === "unassigned"
          ? asset.systemId === null
          : asset.systemId === systemFilter);

      const matchesStatus =
        statusFilter === "all" || asset.status === statusFilter;

      const searchableText = [
        asset.tag,
        asset.name,
        asset.systemName,
        asset.subsystemName,
        asset.assetType,
      ]
        .join(" ")
        .toLowerCase();

      return (
        matchesSystem &&
        matchesStatus &&
        (normalizedQuery.length === 0 ||
          searchableText.includes(normalizedQuery))
      );
    });
  }, [
    assets,
    searchQuery,
    statusFilter,
    systemFilter,
  ]);

  function handleCreateAsset() {
    setOpenMenuAssetId(null);
    setEditingAsset(null);
    setIsAssetModalOpen(true);
  }

  function handleEditAsset(asset: Asset) {
    setOpenMenuAssetId(null);
    setEditingAsset(asset);
    setIsAssetModalOpen(true);
  }

  function handleCloseAssetModal() {
    setIsAssetModalOpen(false);
    setEditingAsset(null);
  }

  async function refreshStructureOptions() {
    const [storedSystems, storedSubsystems] = await Promise.all([
      listSystemsByProject(currentProject.id),
      listSubsystemsByProject(currentProject.id),
    ]);

    setSystems(storedSystems);
    setSubsystems(storedSubsystems);
  }

  async function handleSaveAsset(input: AssetInput): Promise<void> {
    if (editingAsset) {
      const updatedAsset = await updateAsset(editingAsset.id, input);
      setAssets((current) =>
        sortAssets(
          current.map((asset) =>
            asset.id === updatedAsset.id ? updatedAsset : asset,
          ),
        ),
      );
    } else {
      const createdAsset = await createAsset(currentProject.id, input);
      setAssets((current) => sortAssets([...current, createdAsset]));
    }

    await refreshStructureOptions();
    handleCloseAssetModal();
  }

  function handleRequestDeleteAsset(asset: Asset) {
    setOpenMenuAssetId(null);
    setAssetDeleteError(null);
    setAssetToDelete(asset);
  }

  function handleCloseDeleteAsset() {
    if (isDeletingAsset) {
      return;
    }

    setAssetToDelete(null);
    setAssetDeleteError(null);
  }

  async function handleConfirmDeleteAsset() {
    if (!assetToDelete) {
      return;
    }

    const asset = assetToDelete;
    setIsDeletingAsset(true);
    setAssetDeleteError(null);

    try {
      await deleteAsset(asset.id);
      setAssets((current) =>
        current.filter((currentAsset) => currentAsset.id !== asset.id),
      );
      setEditingAsset((current) =>
        current?.id === asset.id ? null : current,
      );
      setAssetToDelete(null);
    } catch (error) {
      setAssetDeleteError(
        error instanceof Error
          ? error.message
          : "Failed to delete the asset.",
      );
    } finally {
      setIsDeletingAsset(false);
    }
  }

  if (isLoading) {
    return (
      <section className="content-card placeholder">
        <h3>Loading assets</h3>
        <p>Reading equipment records for {currentProject.name}.</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="content-card placeholder">
        <h3>Unable to load assets</h3>
        <p>{loadError}</p>
      </section>
    );
  }

  return (
    <>
      <TablePage className="assets-card">
        <div className="projects-header">
          <div>
            {structureNavigation && (
              <button
                className="back-navigation-button"
                type="button"
                onClick={() => onOpenSystem(structureNavigation.returnSystemId)}
              >
                <span aria-hidden="true">←</span>
                {structureNavigation.returnSystemId
                  ? "Back to Subsystems"
                  : "Back to Systems"}
              </button>
            )}
            <h3>Assets</h3>
            <p>
              Manage equipment and commissioning status for{" "}
              {currentProject.name}.
            </p>
          </div>
        </div>

        <ListToolbar filterCount={2}>
          <input
            className="asset-search-input"
            type="search"
            value={searchQuery}
            placeholder="Search tag, name, system, subsystem, or type"
            aria-label="Search assets"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select
            className="asset-status-filter"
            value={systemFilter}
            aria-label="Filter assets by system"
            onChange={(event) => setSystemFilter(event.target.value)}
          >
            <option value="all">All systems</option>
            <option value="unassigned">No system</option>
            {systems.map((system) => (
              <option key={system.id} value={system.id}>
                {system.name}
              </option>
            ))}
          </select>
          <select
            className="asset-status-filter"
            value={statusFilter}
            aria-label="Filter assets by status"
            onChange={(event) =>
              setStatusFilter(event.target.value as AssetStatusFilter)
            }
          >
            <option value="all">All statuses</option>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="blocked">Blocked</option>
          </select>
          <button
            className="primary-button toolbar-primary-button"
            type="button"
            onClick={handleCreateAsset}
          >
            New asset
          </button>

          <span className="asset-result-count">
            {filteredAssets.length} of {assets.length}
          </span>
        </ListToolbar>

        {assets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">+</div>
            <h3>No assets yet</h3>
            <p>Add the first equipment record for this project.</p>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="empty-state compact">
            <h3>No matching assets</h3>
            <p>Change the search text or filters.</p>
          </div>
        ) : (
          <FixedHeaderTable
            className="projects-table assets-table"
            wrapperClassName="assets-table-wrapper"
            ariaLabel="Assets"
            header={
              <tr>
                <th>Tag</th>
                <th>Name</th>
                <th>System</th>
                <th>Type</th>
                <th>Status</th>
                <th>Updated</th>
                <th aria-label="Asset actions" />
              </tr>
            }
            body={
              <>
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} data-navigation-id={asset.id}>
                    <td>
                      <strong className="asset-tag">{asset.tag}</strong>
                    </td>
                    <td>{asset.name}</td>
                    <td>
                      {asset.systemId ? (
                        <button
                          className="asset-structure-link"
                          type="button"
                          aria-label={`Open system ${asset.systemName}`}
                          onClick={() => onOpenSystem(asset.systemId)}
                        >
                          {formatAssetStructure(asset)}
                        </button>
                      ) : formatAssetStructure(asset)}
                    </td>
                    <td>{asset.assetType || "-"}</td>
                    <td className="status-cell">
                      <span className={`status-badge ${asset.status}`}>
                        {formatAssetStatus(asset.status)}
                      </span>
                    </td>
                    <td className="project-updated-cell">
                      {new Date(asset.updatedAt).toLocaleDateString("en-CA")}
                    </td>
                    <td className="table-action-cell">
                      <div className="project-row-actions">
                        <button
                          className="row-action-button"
                          type="button"
                          onClick={() => handleEditAsset(asset)}
                        >
                          Edit
                        </button>
                        <ActionMenu
                          ariaLabel={`More actions for ${asset.tag}`}
                          isOpen={openMenuAssetId === asset.id}
                          onOpenChange={(isOpen) =>
                            setOpenMenuAssetId(isOpen ? asset.id : null)
                          }
                        >
                          <button
                            className="project-menu-item danger"
                            type="button"
                            role="menuitem"
                            onClick={() => handleRequestDeleteAsset(asset)}
                          >
                            Delete asset
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

      <AssetModal
        isOpen={isAssetModalOpen}
        asset={editingAsset}
        systems={systems}
        subsystems={subsystems}
        onClose={handleCloseAssetModal}
        onSave={handleSaveAsset}
      />

      <DeleteConfirmationModal
        isOpen={assetToDelete !== null}
        title="Delete asset"
        message={
          assetToDelete ? (
            <>
              Delete asset <strong>{assetToDelete.tag}</strong>
              {assetToDelete.name ? ` - ${assetToDelete.name}` : ""}? This
              action cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete asset"
        submittingLabel="Deleting asset..."
        isSubmitting={isDeletingAsset}
        error={assetDeleteError}
        onClose={handleCloseDeleteAsset}
        onConfirm={() => {
          void handleConfirmDeleteAsset();
        }}
      />
    </>
  );
}

export default AssetsPage;
