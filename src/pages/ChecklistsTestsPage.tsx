import {
  useEffect,
  useMemo,
  useState,
} from "react";

import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import FixedHeaderTable from "../components/FixedHeaderTable";
import TestRecordModal from "../components/TestRecordModal";
import { listAssetsByProject } from "../repositories/assetRepository";
import {
  createTestRecord,
  deleteTestRecord,
  listTestRecordsByProject,
  updateTestRecord,
} from "../repositories/testRecordRepository";
import type { Asset } from "../types/asset";
import type { Project } from "../types/project";
import type {
  TestRecord,
  TestRecordInput,
  TestRecordStatus,
  TestRecordType,
} from "../types/testRecord";
import TestRecordDetailPage from "./TestRecordDetailPage";

interface ChecklistsTestsPageProps {
  currentProject: Project;
}

type TestRecordTypeFilter =
  | "all"
  | TestRecordType;

type TestRecordStatusFilter =
  | "all"
  | TestRecordStatus;

function formatTestRecordType(
  recordType: TestRecordType,
): string {
  switch (recordType) {
    case "checklist":
      return "Checklist";

    case "functional_test":
      return "Functional test";
  }
}

function formatTestRecordStatus(
  status: TestRecordStatus,
): string {
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

function sortTestRecords(
  records: TestRecord[],
): TestRecord[] {
  return [...records].sort(
    (first, second) => {
      const updatedComparison =
        new Date(second.updatedAt).getTime() -
        new Date(first.updatedAt).getTime();

      if (updatedComparison !== 0) {
        return updatedComparison;
      }

      return first.title.localeCompare(
        second.title,
        undefined,
        {
          sensitivity: "base",
          numeric: true,
        },
      );
    },
  );
}

function ChecklistsTestsPage({
  currentProject,
}: ChecklistsTestsPageProps) {
  const [testRecords, setTestRecords] =
    useState<TestRecord[]>([]);

  const [assets, setAssets] =
    useState<Asset[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState<string | null>(null);

  const [searchQuery, setSearchQuery] =
    useState("");

  const [typeFilter, setTypeFilter] =
    useState<TestRecordTypeFilter>("all");

  const [statusFilter, setStatusFilter] =
    useState<TestRecordStatusFilter>("all");

  const [
    isTestRecordModalOpen,
    setIsTestRecordModalOpen,
  ] = useState(false);

  const [
    editingTestRecord,
    setEditingTestRecord,
  ] = useState<TestRecord | null>(null);

  const [
    selectedTestRecord,
    setSelectedTestRecord,
  ] = useState<TestRecord | null>(null);

  const [
    testRecordToDelete,
    setTestRecordToDelete,
  ] = useState<TestRecord | null>(null);

  const [
    isDeletingTestRecord,
    setIsDeletingTestRecord,
  ] = useState(false);

  const [
    testRecordDeleteError,
    setTestRecordDeleteError,
  ] = useState<string | null>(null);

  const [
    openMenuTestRecordId,
    setOpenMenuTestRecordId,
  ] = useState<string | null>(null);


  useEffect(() => {
    function handleDocumentMouseDown(
      event: MouseEvent,
    ) {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const navigationButton =
        target.closest(
          "button.nav-item",
        );

      if (
        navigationButton instanceof
          HTMLButtonElement &&
        navigationButton.textContent?.trim() ===
          "Checklists & Tests"
      ) {
        setSelectedTestRecord(null);
        setOpenMenuTestRecordId(null);
        return;
      }

      if (
        !target.closest(
          ".project-action-menu",
        )
      ) {
        setOpenMenuTestRecordId(null);
      }
    }

    function handleDocumentKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        setOpenMenuTestRecordId(null);
      }
    }

    document.addEventListener(
      "mousedown",
      handleDocumentMouseDown,
    );

    document.addEventListener(
      "keydown",
      handleDocumentKeyDown,
    );

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

    async function loadPageData() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [
          storedTestRecords,
          storedAssets,
        ] = await Promise.all([
          listTestRecordsByProject(
            currentProject.id,
          ),
          listAssetsByProject(
            currentProject.id,
          ),
        ]);

        if (cancelled) {
          return;
        }

        setTestRecords(
          sortTestRecords(
            storedTestRecords,
          ),
        );

        setAssets(storedAssets);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load checklists and tests.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    setSearchQuery("");
    setTypeFilter("all");
    setStatusFilter("all");

    setEditingTestRecord(null);
    setIsTestRecordModalOpen(false);

    setSelectedTestRecord(null);

    setTestRecordToDelete(null);
    setTestRecordDeleteError(null);
    setIsDeletingTestRecord(false);

    setOpenMenuTestRecordId(null);

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, [currentProject.id]);

  const filteredTestRecords =
    useMemo(() => {
      const normalizedQuery =
        searchQuery
          .trim()
          .toLowerCase();

      return testRecords.filter(
        (testRecord) => {
          const matchesType =
            typeFilter === "all" ||
            testRecord.recordType ===
              typeFilter;

          const matchesStatus =
            statusFilter === "all" ||
            testRecord.status ===
              statusFilter;

          const searchableText = [
            testRecord.title,
            testRecord.description,
            testRecord.assetTag ?? "",
            testRecord.assetName ?? "",
            formatTestRecordType(
              testRecord.recordType,
            ),
            formatTestRecordStatus(
              testRecord.status,
            ),
          ]
            .join(" ")
            .toLowerCase();

          const matchesSearch =
            normalizedQuery.length === 0 ||
            searchableText.includes(
              normalizedQuery,
            );

          return (
            matchesType &&
            matchesStatus &&
            matchesSearch
          );
        },
      );
    }, [
      searchQuery,
      statusFilter,
      testRecords,
      typeFilter,
    ]);

    function replaceTestRecord(
    updatedTestRecord: TestRecord,
  ) {
    setTestRecords((current) =>
      sortTestRecords(
        current.map((testRecord) =>
          testRecord.id ===
          updatedTestRecord.id
            ? updatedTestRecord
            : testRecord,
        ),
      ),
    );

    setSelectedTestRecord((current) =>
      current?.id === updatedTestRecord.id
        ? updatedTestRecord
        : current,
    );
  }

  function handleCreateTestRecord() {
    setOpenMenuTestRecordId(null);
    setEditingTestRecord(null);
    setIsTestRecordModalOpen(true);
  }

  function handleEditTestRecord(
    testRecord: TestRecord,
  ) {
    if (testRecord.signedOffAt) {
      return;
    }

    setOpenMenuTestRecordId(null);
    setEditingTestRecord(testRecord);
    setIsTestRecordModalOpen(true);
  }

  function handleCloseTestRecordModal() {
    setIsTestRecordModalOpen(false);
    setEditingTestRecord(null);
  }

  async function handleSaveTestRecord(
    input: TestRecordInput,
  ): Promise<void> {
    if (editingTestRecord) {
      const updatedTestRecord =
        await updateTestRecord(
          editingTestRecord.id,
          input,
        );

      replaceTestRecord(
        updatedTestRecord,
      );
    } else {
      const createdTestRecord =
        await createTestRecord(
          currentProject.id,
          input,
        );

      setTestRecords((current) =>
        sortTestRecords([
          ...current,
          createdTestRecord,
        ]),
      );
    }

    handleCloseTestRecordModal();
  }

  function handleOpenTestRecord(
    testRecord: TestRecord,
  ) {
    setOpenMenuTestRecordId(null);
    setSelectedTestRecord(testRecord);
  }

  function handleBackToTestRecords() {
    setSelectedTestRecord(null);
  }

  function handleRecordUpdated(
    updatedTestRecord: TestRecord,
  ) {
    replaceTestRecord(
      updatedTestRecord,
    );
  }

  function handleRequestDeleteTestRecord(
    testRecord: TestRecord,
  ) {
    if (testRecord.signedOffAt || testRecord.revisionCount > 0) {
      return;
    }

    setOpenMenuTestRecordId(null);
    setTestRecordDeleteError(null);
    setTestRecordToDelete(testRecord);
  }

  function handleCloseDeleteTestRecord() {
    if (isDeletingTestRecord) {
      return;
    }

    setTestRecordToDelete(null);
    setTestRecordDeleteError(null);
  }

  async function handleConfirmDeleteTestRecord() {
    if (!testRecordToDelete) {
      return;
    }

    const deletingTestRecord =
      testRecordToDelete;

    setIsDeletingTestRecord(true);
    setTestRecordDeleteError(null);

    try {
      await deleteTestRecord(
        deletingTestRecord.id,
      );

      setTestRecords((current) =>
        current.filter(
          (testRecord) =>
            testRecord.id !==
            deletingTestRecord.id,
        ),
      );

      setEditingTestRecord((current) =>
        current?.id ===
        deletingTestRecord.id
          ? null
          : current,
      );

      setSelectedTestRecord((current) =>
        current?.id ===
        deletingTestRecord.id
          ? null
          : current,
      );

      setTestRecordToDelete(null);
    } catch (error) {
      setTestRecordDeleteError(
        error instanceof Error
          ? error.message
          : "Failed to delete the checklist or test.",
      );
    } finally {
      setIsDeletingTestRecord(false);
    }
  }

  if (isLoading) {
    return (
      <section className="content-card placeholder">
        <h3>
          Loading checklists and tests
        </h3>

        <p>
          Reading commissioning records for{" "}
          {currentProject.name}.
        </p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="content-card placeholder">
        <h3>
          Unable to load checklists and tests
        </h3>

        <p>{loadError}</p>
      </section>
    );
  }

  if (selectedTestRecord) {
    return (
      <TestRecordDetailPage
        testRecord={selectedTestRecord}
        onBack={handleBackToTestRecords}
        onRecordUpdated={
          handleRecordUpdated
        }
      />
    );
  }

  return (
    <>
      <section className="content-card section-card assets-card issues-card">
        <div className="projects-header">
          <div>
            <h3>
              Checklists &amp; Tests
            </h3>

            <p>
              Manage commissioning
              checklists and functional
              tests for{" "}
              {currentProject.name}.
            </p>
          </div>
        </div>

        <div className="assets-toolbar issues-toolbar">
          <input
            className="asset-search-input"
            type="search"
            value={searchQuery}
            placeholder="Search title, asset, or description"
            aria-label="Search checklists and tests"
            onChange={(event) =>
              setSearchQuery(
                event.target.value,
              )
            }
          />

          <select
            className="asset-status-filter"
            value={typeFilter}
            aria-label="Filter records by type"
            onChange={(event) =>
              setTypeFilter(
                event.target
                  .value as TestRecordTypeFilter,
              )
            }
          >
            <option value="all">
              All types
            </option>

            <option value="checklist">
              Checklists
            </option>

            <option value="functional_test">
              Functional tests
            </option>
          </select>

          <select
            className="asset-status-filter"
            value={statusFilter}
            aria-label="Filter records by status"
            onChange={(event) =>
              setStatusFilter(
                event.target
                  .value as TestRecordStatusFilter,
              )
            }
          >
            <option value="all">
              All statuses
            </option>

            <option value="not_started">
              Not started
            </option>

            <option value="in_progress">
              In progress
            </option>

            <option value="completed">
              Completed
            </option>

            <option value="blocked">
              Blocked
            </option>
          </select>

          <button
            className="primary-button toolbar-primary-button"
            type="button"
            onClick={
              handleCreateTestRecord
            }
          >
            New record
          </button>

          <span className="asset-result-count">
            {
              filteredTestRecords.length
            }{" "}
            of {testRecords.length}
          </span>
        </div>

        {testRecords.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              +
            </div>

            <h3>
              No checklists or tests yet
            </h3>

            <p>
              Add the first commissioning
              checklist or functional test
              for this project.
            </p>
          </div>
        ) : filteredTestRecords.length ===
          0 ? (
          <div className="empty-state compact">
            <h3>No matching records</h3>

            <p>
              Change the search text,
              type, or status filter.
            </p>
          </div>
        ) : (
          <FixedHeaderTable
            className="projects-table issues-table checklists-tests-table"
            wrapperClassName="issues-table-wrapper"
            ariaLabel="Checklists and tests"
            header={
              <tr>
                                <th>Title</th>
                                <th>Type</th>
                                <th>Asset</th>
                                <th>Progress</th>
                                <th>Status</th>
                                <th>Updated</th>
                                <th aria-label="Record actions" />
                              </tr>
            }
            body={
              <>
                {filteredTestRecords.map(
                                  (testRecord) => (
                                    <tr key={testRecord.id}>
                                      <td
                                        className="issue-title-cell"
                                        title={
                                          testRecord.title
                                        }
                                      >
                                        <button
                                          className="test-record-title-button"
                                          type="button"
                                          onClick={() =>
                                            handleOpenTestRecord(
                                              testRecord,
                                            )
                                          }
                                        >
                                          <strong className="issue-title-text">
                                            {
                                              testRecord.title
                                            }
                                          </strong>
                                        </button>
                                      </td>

                                      <td>
                                        {formatTestRecordType(
                                          testRecord.recordType,
                                        )}
                                      </td>

                                      <td className="issue-asset-cell">
                                        {testRecord.assetTag ? (
                                          <>
                                            <strong className="asset-tag">
                                              {
                                                testRecord.assetTag
                                              }
                                            </strong>

                                            {testRecord.assetName
                                              ? ` — ${testRecord.assetName}`
                                              : ""}
                                          </>
                                        ) : (
                                          "—"
                                        )}
                                      </td>

                                      <td className="issue-date-cell">
                                        {
                                          testRecord.completedItemCount
                                        }{" "}
                                        of{" "}
                                        {
                                          testRecord.totalItemCount
                                        }
                                      </td>

                                      <td className="status-cell issue-status-cell">
                                        <span
                                          className={`status-badge ${testRecord.status}`}
                                        >
                                          {formatTestRecordStatus(
                                            testRecord.status,
                                          )}
                                        </span>
                                      </td>

                                      <td className="project-updated-cell issue-date-cell">
                                        {new Date(
                                          testRecord.updatedAt,
                                        ).toLocaleDateString(
                                          "en-CA",
                                        )}
                                      </td>

                                      <td className="table-action-cell">
                                        <div className="project-row-actions">
                                          <button
                                            className="row-action-button"
                                            type="button"
                                            disabled={
                                              testRecord.signedOffAt !== null
                                            }
                                            title={
                                              testRecord.signedOffAt
                                                ? "Reopen the signed record before editing it."
                                                : undefined
                                            }
                                            onClick={() =>
                                              handleEditTestRecord(
                                                testRecord,
                                              )
                                            }
                                          >
                                            Edit
                                          </button>

                                          <div className="project-action-menu">
                                            <button
                                              className="more-actions-button"
                                              type="button"
                                              aria-label={`More actions for ${testRecord.title}`}
                                              aria-haspopup="menu"
                                              aria-expanded={
                                                openMenuTestRecordId ===
                                                testRecord.id
                                              }
                                              onClick={() =>
                                                setOpenMenuTestRecordId(
                                                  (current) =>
                                                    current ===
                                                    testRecord.id
                                                      ? null
                                                      : testRecord.id,
                                                )
                                              }
                                            >
                                              ⋯
                                            </button>

                                            {openMenuTestRecordId ===
                                              testRecord.id && (
                                              <div
                                                className="project-action-menu-panel"
                                                role="menu"
                                              >
                                                <button
                                                  className="project-menu-item"
                                                  type="button"
                                                  role="menuitem"
                                                  onClick={() =>
                                                    handleOpenTestRecord(
                                                      testRecord,
                                                    )
                                                  }
                                                >
                                                  Open record
                                                </button>

                                                <button
                                                  className="project-menu-item danger"
                                                  type="button"
                                                  role="menuitem"
                                                  disabled={
                                                    testRecord.signedOffAt !== null ||
                                                    testRecord.revisionCount > 0
                                                  }
                                                  title={
                                                    testRecord.signedOffAt !== null ||
                                                    testRecord.revisionCount > 0
                                                      ? "Signed or revised records cannot be deleted."
                                                      : undefined
                                                  }
                                                  onClick={() =>
                                                    handleRequestDeleteTestRecord(
                                                      testRecord,
                                                    )
                                                  }
                                                >
                                                  Delete record
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  ),
                                )}
              </>
            }
          />
        )}
      </section>

      <TestRecordModal
        isOpen={
          isTestRecordModalOpen
        }
        assets={assets}
        testRecord={
          editingTestRecord
        }
        onClose={
          handleCloseTestRecordModal
        }
        onSave={
          handleSaveTestRecord
        }
      />

      <DeleteConfirmationModal
        isOpen={
          testRecordToDelete !== null
        }
        title="Delete record"
        message={
          testRecordToDelete ? (
            <>
              Delete{" "}
              <strong>
                {
                  testRecordToDelete.title
                }
              </strong>
              ? All items contained in
              this record will also be
              deleted. This action cannot
              be undone.
            </>
          ) : null
        }
        confirmLabel="Delete record"
        submittingLabel="Deleting record..."
        isSubmitting={
          isDeletingTestRecord
        }
        error={
          testRecordDeleteError
        }
        onClose={
          handleCloseDeleteTestRecord
        }
        onConfirm={() => {
          void handleConfirmDeleteTestRecord();
        }}
      />
    </>
  );
}

export default ChecklistsTestsPage;
