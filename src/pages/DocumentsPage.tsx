import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useState } from "react";

import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import DocumentModal from "../components/DocumentModal";
import FixedHeaderTable from "../components/FixedHeaderTable";
import { listAssetsByProject } from "../repositories/assetRepository";
import {
  createProjectDocument,
  deleteProjectDocument,
  listDocumentsByProject,
  updateProjectDocument,
} from "../repositories/documentRepository";
import type { Asset } from "../types/asset";
import type {
  DocumentCategory,
  DocumentStatus,
  ProjectDocument,
  ProjectDocumentInput,
} from "../types/document";
import type { Project } from "../types/project";
import "./DocumentsPage.css";

interface DocumentsPageProps {
  currentProject: Project;
}

type CategoryFilter = "all" | DocumentCategory;
type StatusFilter = "all" | DocumentStatus;

function fileNameFromPath(path: string) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

function formatDocumentCategory(category: DocumentCategory) {
  switch (category) {
    case "drawing":
      return "Drawing";
    case "specification":
      return "Specification";
    case "datasheet":
      return "Data sheet";
    case "manual":
      return "Manual";
    case "procedure":
      return "Procedure";
    case "certificate":
      return "Certificate";
    case "test_record":
      return "Test record";
    case "report":
      return "Report";
    case "other":
      return "Other";
  }
}

function formatDocumentStatus(status: DocumentStatus) {
  switch (status) {
    case "draft":
      return "Draft";
    case "for_review":
      return "For review";
    case "approved":
      return "Approved";
    case "superseded":
      return "Superseded";
  }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sortDocuments(documents: ProjectDocument[]) {
  return [...documents].sort((first, second) => {
    const dateComparison =
      Date.parse(second.updatedAt) - Date.parse(first.updatedAt);

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return first.title.localeCompare(second.title, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
}

function DocumentsPage({ currentProject }: DocumentsPageProps) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");
  const [assetFilter, setAssetFilter] = useState("all");
  const [isDocumentModalOpen, setIsDocumentModalOpen] =
    useState(false);
  const [editingDocument, setEditingDocument] =
    useState<ProjectDocument | null>(null);
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [sourceFileName, setSourceFileName] =
    useState<string | null>(null);
  const [documentToDelete, setDocumentToDelete] =
    useState<ProjectDocument | null>(null);
  const [isDeletingDocument, setIsDeletingDocument] =
    useState(false);
  const [documentDeleteError, setDocumentDeleteError] =
    useState<string | null>(null);
  const [openMenuDocumentId, setOpenMenuDocumentId] =
    useState<string | null>(null);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;

      if (
        target instanceof Element &&
        !target.closest(".project-action-menu")
      ) {
        setOpenMenuDocumentId(null);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuDocumentId(null);
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener(
        "mousedown",
        handleDocumentMouseDown,
      );
      document.removeEventListener(
        "keydown",
        handleDocumentKeyDown,
      );
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDocuments() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [storedDocuments, storedAssets] = await Promise.all([
          listDocumentsByProject(currentProject.id),
          listAssetsByProject(currentProject.id),
        ]);

        if (!cancelled) {
          setDocuments(sortDocuments(storedDocuments));
          setAssets(storedAssets);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load documents.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    setSearchQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
    setAssetFilter("all");
    setActionError(null);
    setEditingDocument(null);
    setSourcePath(null);
    setSourceFileName(null);
    setIsDocumentModalOpen(false);
    setDocumentToDelete(null);
    setDocumentDeleteError(null);
    setOpenMenuDocumentId(null);
    void loadDocuments();

    return () => {
      cancelled = true;
    };
  }, [currentProject.id]);

  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return documents.filter((document) => {
      const asset = document.assetId
        ? assetById.get(document.assetId)
        : null;
      const matchesCategory =
        categoryFilter === "all" ||
        document.category === categoryFilter;
      const matchesStatus =
        statusFilter === "all" ||
        document.status === statusFilter;
      const matchesAsset =
        assetFilter === "all" ||
        (assetFilter === "unlinked"
          ? document.assetId === null
          : document.assetId === assetFilter);
      const searchableText = [
        document.title,
        document.originalFileName,
        document.revision,
        document.notes,
        formatDocumentCategory(document.category),
        formatDocumentStatus(document.status),
        asset?.tag ?? "",
        asset?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return (
        matchesCategory &&
        matchesStatus &&
        matchesAsset &&
        (normalizedQuery.length === 0 ||
          searchableText.includes(normalizedQuery))
      );
    });
  }, [
    assetById,
    assetFilter,
    categoryFilter,
    documents,
    searchQuery,
    statusFilter,
  ]);

  async function handleImportDocument() {
    setActionError(null);
    setOpenMenuDocumentId(null);

    try {
      const selectedPath = await open({
        multiple: false,
        directory: false,
        title: "Import project document",
        filters: [
          {
            name: "Documents",
            extensions: [
              "pdf",
              "png",
              "jpg",
              "jpeg",
              "webp",
              "tif",
              "tiff",
              "doc",
              "docx",
              "xls",
              "xlsx",
              "ppt",
              "pptx",
              "txt",
              "csv",
            ],
          },
        ],
      });

      if (typeof selectedPath !== "string") {
        return;
      }

      setEditingDocument(null);
      setSourcePath(selectedPath);
      setSourceFileName(fileNameFromPath(selectedPath));
      setIsDocumentModalOpen(true);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to select a document.",
      );
    }
  }

  function handleEditDocument(document: ProjectDocument) {
    setActionError(null);
    setOpenMenuDocumentId(null);
    setSourcePath(null);
    setSourceFileName(null);
    setEditingDocument(document);
    setIsDocumentModalOpen(true);
  }

  function handleCloseDocumentModal() {
    setIsDocumentModalOpen(false);
    setEditingDocument(null);
    setSourcePath(null);
    setSourceFileName(null);
  }

  async function handleSaveDocument(
    input: ProjectDocumentInput,
  ): Promise<void> {
    if (editingDocument) {
      const updatedDocument = await updateProjectDocument(
        editingDocument.id,
        input,
      );

      setDocuments((current) =>
        sortDocuments(
          current.map((document) =>
            document.id === updatedDocument.id
              ? updatedDocument
              : document,
          ),
        ),
      );
    } else {
      if (!sourcePath) {
        throw new Error("Select a file before importing.");
      }

      const createdDocument = await createProjectDocument(
        currentProject.id,
        sourcePath,
        input,
      );

      setDocuments((current) =>
        sortDocuments([...current, createdDocument]),
      );
    }

    handleCloseDocumentModal();
  }

  async function handleOpenDocument(document: ProjectDocument) {
    setActionError(null);
    setOpenMenuDocumentId(null);

    try {
      await invoke("open_project_document", {
        storedPath: document.storedPath,
      });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to open the document.",
      );
    }
  }

  async function handleRevealDocument(document: ProjectDocument) {
    setActionError(null);
    setOpenMenuDocumentId(null);

    try {
      await revealItemInDir(document.storedPath);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to reveal the document.",
      );
    }
  }

  function handleRequestDeleteDocument(
    document: ProjectDocument,
  ) {
    setOpenMenuDocumentId(null);
    setDocumentDeleteError(null);
    setDocumentToDelete(document);
  }

  function handleCloseDeleteDocument() {
    if (isDeletingDocument) {
      return;
    }

    setDocumentToDelete(null);
    setDocumentDeleteError(null);
  }

  async function handleConfirmDeleteDocument() {
    if (!documentToDelete) {
      return;
    }

    const document = documentToDelete;
    setIsDeletingDocument(true);
    setDocumentDeleteError(null);

    try {
      await deleteProjectDocument(document);
      setDocuments((current) =>
        current.filter(
          (currentDocument) =>
            currentDocument.id !== document.id,
        ),
      );
      setEditingDocument((current) =>
        current?.id === document.id ? null : current,
      );
      setDocumentToDelete(null);
    } catch (error) {
      setDocumentDeleteError(
        error instanceof Error
          ? error.message
          : "Failed to delete the document.",
      );
    } finally {
      setIsDeletingDocument(false);
    }
  }

  if (isLoading) {
    return (
      <section className="content-card placeholder">
        <h3>Loading documents</h3>
        <p>Reading project documents for {currentProject.name}.</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="content-card placeholder">
        <h3>Unable to load documents</h3>
        <p>{loadError}</p>
      </section>
    );
  }

  return (
    <>
      <section className="content-card section-card documents-card">
        <div className="projects-header">
          <div>
            <h3>Documents</h3>
            <p>
              Manage controlled project files for{" "}
              {currentProject.name}.
            </p>
          </div>
        </div>

        <div className="documents-toolbar">
          <input
            className="document-search-input"
            type="search"
            value={searchQuery}
            placeholder="Search title, file, revision, asset, or notes"
            aria-label="Search documents"
            onChange={(event) =>
              setSearchQuery(event.target.value)
            }
          />

          <select
            className="document-filter document-category-filter"
            value={categoryFilter}
            aria-label="Filter documents by category"
            onChange={(event) =>
              setCategoryFilter(
                event.target.value as CategoryFilter,
              )
            }
          >
            <option value="all">All categories</option>
            <option value="drawing">Drawing</option>
            <option value="specification">Specification</option>
            <option value="datasheet">Data sheet</option>
            <option value="manual">Manual</option>
            <option value="procedure">Procedure</option>
            <option value="certificate">Certificate</option>
            <option value="test_record">Test record</option>
            <option value="report">Report</option>
            <option value="other">Other</option>
          </select>

          <select
            className="document-filter document-status-filter"
            value={statusFilter}
            aria-label="Filter documents by status"
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="for_review">For review</option>
            <option value="approved">Approved</option>
            <option value="superseded">Superseded</option>
          </select>

          <select
            className="document-filter document-asset-filter"
            value={assetFilter}
            aria-label="Filter documents by asset"
            onChange={(event) =>
              setAssetFilter(event.target.value)
            }
          >
            <option value="all">All assets</option>
            <option value="unlinked">No linked asset</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.tag} — {asset.name}
              </option>
            ))}
          </select>

          <button
            className="primary-button toolbar-primary-button"
            type="button"
            onClick={() => {
              void handleImportDocument();
            }}
          >
            Import document
          </button>

          <span className="document-result-count">
            {filteredDocuments.length} of {documents.length}
          </span>
        </div>

        {actionError && (
          <p className="projects-action-error" role="alert">
            {actionError}
          </p>
        )}

        {documents.length === 0 ? (
          <div className="empty-state">
            <h3>No documents yet</h3>
            <p>Import the first controlled file for this project.</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="empty-state compact">
            <h3>No matching documents</h3>
            <p>Change the search text or document filters.</p>
          </div>
        ) : (
          <FixedHeaderTable
            className="projects-table documents-table"
            wrapperClassName="documents-table-wrapper"
            ariaLabel="Project documents"
            header={
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Revision</th>
                <th>Status</th>
                <th>Asset</th>
                <th>Size</th>
                <th>Updated</th>
                <th aria-label="Document actions" />
              </tr>
            }
            body={
              <>
                {filteredDocuments.map((document) => {
                  const asset = document.assetId
                    ? assetById.get(document.assetId)
                    : null;

                  return (
                    <tr key={document.id}>
                      <td>
                        <div className="document-title-cell">
                          <strong>{document.title}</strong>
                          <span title={document.originalFileName}>
                            {document.originalFileName}
                          </span>
                        </div>
                      </td>
                      <td>
                        {formatDocumentCategory(document.category)}
                      </td>
                      <td>{document.revision || "—"}</td>
                      <td className="status-cell">
                        <span
                          className={`status-badge ${document.status}`}
                        >
                          {formatDocumentStatus(document.status)}
                        </span>
                      </td>
                      <td>
                        {asset
                          ? `${asset.tag} — ${asset.name}`
                          : "—"}
                      </td>
                      <td>{formatFileSize(document.fileSize)}</td>
                      <td className="project-updated-cell">
                        {new Date(
                          document.updatedAt,
                        ).toLocaleDateString("en-CA")}
                      </td>
                      <td className="table-action-cell">
                        <div className="project-row-actions">
                          <button
                            className="row-action-button"
                            type="button"
                            onClick={() => {
                              void handleOpenDocument(document);
                            }}
                          >
                            Open
                          </button>
                          <button
                            className="row-action-button"
                            type="button"
                            onClick={() =>
                              handleEditDocument(document)
                            }
                          >
                            Edit
                          </button>
                          <div className="project-action-menu">
                            <button
                              className="more-actions-button"
                              type="button"
                              aria-label={`More actions for ${document.title}`}
                              aria-haspopup="menu"
                              aria-expanded={
                                openMenuDocumentId === document.id
                              }
                              onClick={() =>
                                setOpenMenuDocumentId((current) =>
                                  current === document.id
                                    ? null
                                    : document.id,
                                )
                              }
                            >
                              ⋯
                            </button>
                            {openMenuDocumentId === document.id && (
                              <div
                                className="project-action-menu-panel"
                                role="menu"
                              >
                                <button
                                  className="project-menu-item"
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    void handleRevealDocument(
                                      document,
                                    );
                                  }}
                                >
                                  Show in folder
                                </button>
                                <button
                                  className="project-menu-item danger"
                                  type="button"
                                  role="menuitem"
                                  onClick={() =>
                                    handleRequestDeleteDocument(
                                      document,
                                    )
                                  }
                                >
                                  Delete document
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </>
            }
          />
        )}
      </section>

      <DocumentModal
        isOpen={isDocumentModalOpen}
        document={editingDocument}
        sourceFileName={sourceFileName}
        assets={assets}
        onClose={handleCloseDocumentModal}
        onSave={handleSaveDocument}
      />

      <DeleteConfirmationModal
        isOpen={documentToDelete !== null}
        title="Delete document"
        message={
          documentToDelete ? (
            <>
              Delete document{" "}
              <strong>{documentToDelete.title}</strong>? The managed
              file and its database record will both be removed. This
              action cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete document"
        submittingLabel="Deleting document..."
        isSubmitting={isDeletingDocument}
        error={documentDeleteError}
        onClose={handleCloseDeleteDocument}
        onConfirm={() => {
          void handleConfirmDeleteDocument();
        }}
      />
    </>
  );
}

export default DocumentsPage;
