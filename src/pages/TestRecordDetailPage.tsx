import {
  useEffect,
  useMemo,
  useState,
} from "react";

import DeleteConfirmationModal from "../components/DeleteConfirmationModal";
import FixedHeaderTable from "../components/FixedHeaderTable";
import TestItemModal from "../components/TestItemModal";
import {
  createTestItem,
  deleteTestItem,
  getTestRecordById,
  listTestItems,
  updateTestItem,
} from "../repositories/testRecordRepository";
import type {
  TestItem,
  TestItemInput,
  TestItemResult,
  TestRecord,
  TestRecordStatus,
  TestRecordType,
} from "../types/testRecord";

interface TestRecordDetailPageProps {
  testRecord: TestRecord;
  onBack: () => void;
  onRecordUpdated: (
    testRecord: TestRecord,
  ) => void;
}

type TestItemResultFilter =
  | "all"
  | TestItemResult;

function formatRecordType(
  recordType: TestRecordType,
): string {
  switch (recordType) {
    case "checklist":
      return "Checklist";

    case "functional_test":
      return "Functional test";
  }
}

function formatRecordStatus(
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

function formatItemResult(
  result: TestItemResult,
): string {
  switch (result) {
    case "pending":
      return "Pending";

    case "pass":
      return "Pass";

    case "fail":
      return "Fail";

    case "not_applicable":
      return "N/A";
  }
}

function sortTestItems(
  items: TestItem[],
): TestItem[] {
  return [...items].sort(
    (first, second) => {
      if (
        first.sortOrder !==
        second.sortOrder
      ) {
        return (
          first.sortOrder -
          second.sortOrder
        );
      }

      return (
        new Date(
          first.createdAt,
        ).getTime() -
        new Date(
          second.createdAt,
        ).getTime()
      );
    },
  );
}

function TestRecordDetailPage({
  testRecord,
  onBack,
  onRecordUpdated,
}: TestRecordDetailPageProps) {
  const [
    currentRecord,
    setCurrentRecord,
  ] = useState<TestRecord>(
    testRecord,
  );

  const [testItems, setTestItems] =
    useState<TestItem[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState<string | null>(null);

  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    resultFilter,
    setResultFilter,
  ] =
    useState<TestItemResultFilter>(
      "all",
    );

  const [
    isTestItemModalOpen,
    setIsTestItemModalOpen,
  ] = useState(false);

  const [
    editingTestItem,
    setEditingTestItem,
  ] =
    useState<TestItem | null>(null);

  const [
    testItemToDelete,
    setTestItemToDelete,
  ] =
    useState<TestItem | null>(null);

  const [
    isDeletingTestItem,
    setIsDeletingTestItem,
  ] = useState(false);

  const [
    testItemDeleteError,
    setTestItemDeleteError,
  ] = useState<string | null>(
    null,
  );

  const [
    openMenuTestItemId,
    setOpenMenuTestItemId,
  ] = useState<string | null>(
    null,
  );


  useEffect(() => {
    const initialTestRecord =
      testRecord;

    const testRecordId =
      initialTestRecord.id;

    let cancelled = false;

    async function loadRecordDetails() {
      setIsLoading(true);
      setLoadError(null);

      setCurrentRecord(
        initialTestRecord,
      );

      setTestItems([]);
      setSearchQuery("");
      setResultFilter("all");

      setEditingTestItem(null);
      setIsTestItemModalOpen(false);

      setTestItemToDelete(null);
      setTestItemDeleteError(null);
      setIsDeletingTestItem(false);

      setOpenMenuTestItemId(null);

      try {
        const [
          storedRecord,
          storedTestItems,
        ] = await Promise.all([
          getTestRecordById(
            testRecordId,
          ),
          listTestItems(
            testRecordId,
          ),
        ]);

        if (cancelled) {
          return;
        }

        setCurrentRecord(
          storedRecord,
        );

        setTestItems(
          sortTestItems(
            storedTestItems,
          ),
        );

        onRecordUpdated(
          storedRecord,
        );
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load checklist items.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadRecordDetails();

    return () => {
      cancelled = true;
    };
  }, [testRecord.id]);

  useEffect(() => {
    function handleDocumentMouseDown(
      event: MouseEvent,
    ) {
      const target = event.target;

      if (
        target instanceof Element &&
        !target.closest(
          ".project-action-menu",
        )
      ) {
        setOpenMenuTestItemId(
          null,
        );
      }
    }

    function handleDocumentKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key !== "Escape") {
        return;
      }

      if (openMenuTestItemId) {
        setOpenMenuTestItemId(
          null,
        );

        return;
      }

      if (
        isTestItemModalOpen ||
        testItemToDelete ||
        isDeletingTestItem
      ) {
        return;
      }

      onBack();
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
  }, [
    isDeletingTestItem,
    isTestItemModalOpen,
    onBack,
    openMenuTestItemId,
    testItemToDelete,
  ]);

  const filteredTestItems =
    useMemo(() => {
      const normalizedQuery =
        searchQuery
          .trim()
          .toLowerCase();

      return testItems.filter(
        (testItem) => {
          const matchesResult =
            resultFilter === "all" ||
            testItem.result ===
              resultFilter;

          const searchableText = [
            testItem.description,
            testItem.acceptanceCriteria,
            testItem.notes,
            formatItemResult(
              testItem.result,
            ),
          ]
            .join(" ")
            .toLowerCase();

          const matchesSearch =
            normalizedQuery.length ===
              0 ||
            searchableText.includes(
              normalizedQuery,
            );

          return (
            matchesResult &&
            matchesSearch
          );
        },
      );
    }, [
      resultFilter,
      searchQuery,
      testItems,
    ]);

    const nextSortOrder =
    useMemo(() => {
      if (testItems.length === 0) {
        return 0;
      }

      return (
        Math.max(
          ...testItems.map(
            (testItem) =>
              testItem.sortOrder,
          ),
        ) + 1
      );
    }, [testItems]);

  function handleAddTestItem() {
    setOpenMenuTestItemId(null);
    setEditingTestItem(null);
    setIsTestItemModalOpen(true);
  }

  function handleEditTestItem(
    testItem: TestItem,
  ) {
    setOpenMenuTestItemId(null);
    setEditingTestItem(testItem);
    setIsTestItemModalOpen(true);
  }

  function handleCloseTestItemModal() {
    setIsTestItemModalOpen(false);
    setEditingTestItem(null);
  }

  async function handleSaveTestItem(
    input: TestItemInput,
  ): Promise<void> {
    let savedTestItem: TestItem;

    if (editingTestItem) {
      savedTestItem =
        await updateTestItem(
          editingTestItem.id,
          input,
        );

      setTestItems((current) =>
        sortTestItems(
          current.map((testItem) =>
            testItem.id ===
            savedTestItem.id
              ? savedTestItem
              : testItem,
          ),
        ),
      );
    } else {
      savedTestItem =
        await createTestItem(
          currentRecord.id,
          input,
        );

      setTestItems((current) =>
        sortTestItems([
          ...current,
          savedTestItem,
        ]),
      );
    }

    const refreshedRecord =
      await getTestRecordById(
        currentRecord.id,
      );

    setCurrentRecord(
      refreshedRecord,
    );

    onRecordUpdated(
      refreshedRecord,
    );

    handleCloseTestItemModal();
  }

  function handleRequestDeleteTestItem(
    testItem: TestItem,
  ) {
    setOpenMenuTestItemId(null);
    setTestItemDeleteError(null);
    setTestItemToDelete(testItem);
  }

  function handleCloseDeleteTestItem() {
    if (isDeletingTestItem) {
      return;
    }

    setTestItemToDelete(null);
    setTestItemDeleteError(null);
  }

  async function handleConfirmDeleteTestItem() {
    if (!testItemToDelete) {
      return;
    }

    const deletingTestItem =
      testItemToDelete;

    setIsDeletingTestItem(true);
    setTestItemDeleteError(null);

    try {
      await deleteTestItem(
        deletingTestItem.id,
      );

      setTestItems((current) =>
        current.filter(
          (testItem) =>
            testItem.id !==
            deletingTestItem.id,
        ),
      );

      const refreshedRecord =
        await getTestRecordById(
          currentRecord.id,
        );

      setCurrentRecord(
        refreshedRecord,
      );

      onRecordUpdated(
        refreshedRecord,
      );

      setTestItemToDelete(null);
    } catch (error) {
      setTestItemDeleteError(
        error instanceof Error
          ? error.message
          : "Failed to delete the checklist item.",
      );
    } finally {
      setIsDeletingTestItem(false);
    }
  }

  return (
    <>
      <section className="content-card section-card assets-card issues-card test-record-detail-page">
        <div className="projects-header test-record-page-header">
          <div className="test-record-page-heading">
            <button
              className="back-navigation-button"
              type="button"
              onClick={onBack}
            >
              <span aria-hidden="true">
                ←
              </span>

              Back to Checklists &amp; Tests
            </button>

            <h3>
              {currentRecord.title}
            </h3>

            <p>
              {formatRecordType(
                currentRecord.recordType,
              )}

              {" · "}

              {currentRecord.assetTag ? (
                <>
                  <strong>
                    {
                      currentRecord.assetTag
                    }
                  </strong>

                  {currentRecord.assetName
                    ? ` — ${currentRecord.assetName}`
                    : ""}
                </>
              ) : (
                "No linked asset"
              )}
            </p>

            {currentRecord.description && (
              <p className="test-record-page-description">
                {
                  currentRecord.description
                }
              </p>
            )}
          </div>

          <div className="test-record-page-summary">
            <div className="test-record-page-summary-item">
              <span>Progress</span>

              <strong>
                {
                  currentRecord.completedItemCount
                }{" "}
                of{" "}
                {
                  currentRecord.totalItemCount
                }
              </strong>
            </div>

            <div className="test-record-page-summary-item">
              <span>Failed</span>

              <strong>
                {
                  currentRecord.failedItemCount
                }
              </strong>
            </div>

            <div className="test-record-page-summary-item">
              <span>Status</span>

              <strong
                className={`test-record-status-text ${currentRecord.status}`}
              >
                {formatRecordStatus(
                  currentRecord.status,
                )}
              </strong>
            </div>
          </div>
        </div>

        <div className="assets-toolbar issues-toolbar test-record-items-toolbar">
          <input
            className="asset-search-input"
            type="search"
            value={searchQuery}
            placeholder="Search item, criteria, or notes"
            aria-label="Search checklist items"
            onChange={(event) =>
              setSearchQuery(
                event.target.value,
              )
            }
          />

          <select
            className="asset-status-filter"
            value={resultFilter}
            aria-label="Filter items by result"
            onChange={(event) =>
              setResultFilter(
                event.target
                  .value as TestItemResultFilter,
              )
            }
          >
            <option value="all">
              All results
            </option>

            <option value="pending">
              Pending
            </option>

            <option value="pass">
              Pass
            </option>

            <option value="fail">
              Fail
            </option>

            <option value="not_applicable">
              N/A
            </option>
          </select>

          <button
            className="primary-button toolbar-primary-button"
            type="button"
            disabled={isLoading}
            onClick={handleAddTestItem}
          >
            Add item
          </button>

          <span className="asset-result-count">
            {
              filteredTestItems.length
            }{" "}
            of {testItems.length}
          </span>
        </div>

        {isLoading ? (
          <div className="empty-state test-record-detail-state">
            <h3>Loading items</h3>

            <p>
              Reading checklist and
              test items.
            </p>
          </div>
        ) : loadError ? (
          <div className="empty-state test-record-detail-state">
            <h3>
              Unable to load items
            </h3>

            <p>{loadError}</p>
          </div>
        ) : testItems.length === 0 ? (
          <div className="empty-state test-record-detail-state">
            <h3>No items yet</h3>

            <p>
              Add an inspection or test
              item from the toolbar above.
            </p>
          </div>
        ) : filteredTestItems.length ===
          0 ? (
          <div className="empty-state compact test-record-detail-state">
            <h3>
              No matching items
            </h3>

            <p>
              Change the search text or
              result filter.
            </p>
          </div>
        ) : (
          <FixedHeaderTable
            className="projects-table issues-table test-record-items-table"
            wrapperClassName="issues-table-wrapper test-record-items-table-wrapper"
            ariaLabel="Checklist and test items"
            header={
              <tr>
                                <th>Item</th>

                                <th>
                                  Acceptance criteria
                                </th>

                                <th>Result</th>

                                <th>Notes</th>

                                <th aria-label="Item actions" />
                              </tr>
            }
            body={
              <>
                {filteredTestItems.map(
                                  (testItem) => {
                                    const itemNumber =
                                      testItems.findIndex(
                                        (current) =>
                                          current.id ===
                                          testItem.id,
                                      ) + 1;

                                    return (
                                      <tr key={testItem.id}>
                                        <td>
                                          <div className="test-item-description">
                                            <span className="test-item-number">
                                              {
                                                itemNumber
                                              }
                                            </span>

                                            <strong>
                                              {
                                                testItem.description
                                              }
                                            </strong>
                                          </div>
                                        </td>

                                        <td>
                                          {testItem.acceptanceCriteria ||
                                            "—"}
                                        </td>

                                        <td>
                                          <span
                                            className={`test-item-result ${testItem.result}`}
                                          >
                                            {formatItemResult(
                                              testItem.result,
                                            )}
                                          </span>
                                        </td>

                                        <td>
                                          {testItem.notes ||
                                            "—"}
                                        </td>

                                        <td className="table-action-cell">
                                          <div className="project-row-actions">
                                            <button
                                              className="row-action-button"
                                              type="button"
                                              onClick={() =>
                                                handleEditTestItem(
                                                  testItem,
                                                )
                                              }
                                            >
                                              Edit
                                            </button>

                                            <div className="project-action-menu">
                                              <button
                                                className="more-actions-button"
                                                type="button"
                                                aria-label={`More actions for ${testItem.description}`}
                                                aria-haspopup="menu"
                                                aria-expanded={
                                                  openMenuTestItemId ===
                                                  testItem.id
                                                }
                                                onClick={() =>
                                                  setOpenMenuTestItemId(
                                                    (current) =>
                                                      current ===
                                                      testItem.id
                                                        ? null
                                                        : testItem.id,
                                                  )
                                                }
                                              >
                                                ⋯
                                              </button>

                                              {openMenuTestItemId ===
                                                testItem.id && (
                                                <div
                                                  className="project-action-menu-panel"
                                                  role="menu"
                                                >
                                                  <button
                                                    className="project-menu-item danger"
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={() =>
                                                      handleRequestDeleteTestItem(
                                                        testItem,
                                                      )
                                                    }
                                                  >
                                                    Delete item
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  },
                                )}
              </>
            }
          />
        )}
      </section>

      <TestItemModal
        isOpen={
          isTestItemModalOpen
        }
        testItem={
          editingTestItem
        }
        nextSortOrder={
          nextSortOrder
        }
        onClose={
          handleCloseTestItemModal
        }
        onSave={
          handleSaveTestItem
        }
      />

      <DeleteConfirmationModal
        isOpen={
          testItemToDelete !== null
        }
        title="Delete checklist item"
        message={
          testItemToDelete ? (
            <>
              Delete{" "}
              <strong>
                {
                  testItemToDelete.description
                }
              </strong>
              ? This action cannot be
              undone.
            </>
          ) : null
        }
        confirmLabel="Delete item"
        submittingLabel="Deleting item..."
        isSubmitting={
          isDeletingTestItem
        }
        error={
          testItemDeleteError
        }
        onClose={
          handleCloseDeleteTestItem
        }
        onConfirm={() => {
          void handleConfirmDeleteTestItem();
        }}
      />
    </>
  );
}

export default TestRecordDetailPage;