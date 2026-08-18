import { useEffect, useMemo, useState } from "react";
import { listAllAuditEvents } from "../repositories/auditRepository";
import { saveAuditHistoryCsv } from "../services/auditExportService";
import type { AuditEntityType, AuditEvent } from "../types/audit";
import AuditEventDetailModal from "./AuditEventDetailModal";

interface ActivityHistoryModalProps {
  isOpen: boolean;
  projectId: string;
  projectName: string;
  onClose: () => void;
  onOpenRecord: (event: AuditEvent) => void;
}

function formatAction(action: string): string {
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatEntity(type: AuditEntityType): string {
  switch (type) {
    case "project":
      return "Project";
    case "system":
      return "System";
    case "subsystem":
      return "Subsystem";
    case "asset":
      return "Asset";
    case "issue":
      return "Issue";
    case "test_record":
      return "Test record";
    case "test_item":
      return "Test item";
    case "document":
      return "Document";
    case "turnover_package":
      return "Turnover package";
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function ActivityHistoryModal({
  isOpen,
  projectId,
  projectName,
  onClose,
  onOpenRecord,
}: ActivityHistoryModalProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedCount, setExportedCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    async function loadActivityHistory() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const storedEvents = await listAllAuditEvents(projectId);

        if (!cancelled) {
          setEvents(storedEvents);
        }
      } catch (error) {
        if (!cancelled) {
          setEvents([]);
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load the activity history.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    setSelectedEvent(null);
    setSearchQuery("");
    setExportError(null);
    setExportedCount(null);
    void loadActivityHistory();

    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId, reloadKey]);

  useEffect(() => {
    if (!isOpen || selectedEvent) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isExporting) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isExporting, isOpen, onClose, selectedEvent]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return events;
    }

    return events.filter((event) =>
      [
        event.entityLabel,
        event.actor,
        event.reason,
        formatEntity(event.entityType),
        formatAction(event.action),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [events, searchQuery]);

  function handleOpenRecord(event: AuditEvent) {
    setSelectedEvent(null);
    onClose();
    onOpenRecord(event);
  }

  async function handleExport() {
    if (isExporting || filteredEvents.length === 0) {
      return;
    }

    const eventsToExport = filteredEvents;
    setIsExporting(true);
    setExportError(null);
    setExportedCount(null);

    try {
      const path = await saveAuditHistoryCsv({
        projectName,
        events: eventsToExport,
      });

      if (path) {
        setExportedCount(eventsToExport.length);
      }
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Failed to export the audit history.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  if (selectedEvent) {
    return (
      <AuditEventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onOpenRecord={handleOpenRecord}
      />
    );
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal activity-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-history-title"
      >
        <div className="activity-history-heading">
          <div>
            <h2 id="activity-history-title" className="modal-form-title">
              Activity history
            </h2>
            <p>{projectName}</p>
          </div>
          {!isLoading && !loadError && (
            <span className="activity-history-count">
              {filteredEvents.length} of {events.length}
            </span>
          )}
        </div>

        <div className="activity-history-toolbar">
          <input
            className="project-search-input activity-history-search-input"
            type="search"
            value={searchQuery}
            placeholder="Search record, operator, or reason"
            aria-label="Search activity history"
            disabled={isLoading || events.length === 0}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setExportError(null);
              setExportedCount(null);
            }}
          />
        </div>

        <div className="activity-history-content">
          {isLoading ? (
            <div className="activity-history-state">
              <strong>Loading activity history</strong>
              <span>Reading recorded changes for this project.</span>
            </div>
          ) : loadError ? (
            <div className="activity-history-state">
              <strong>Unable to load activity history</strong>
              <span>{loadError}</span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReloadKey((current) => current + 1)}
              >
                Try again
              </button>
            </div>
          ) : events.length === 0 ? (
            <div className="activity-history-state">
              <strong>No recorded activity yet</strong>
              <span>New changes will appear here automatically.</span>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="activity-history-state">
              <strong>No matching activity</strong>
              <span>Change the search text to view other records.</span>
            </div>
          ) : (
            <div className="activity-history-list">
              {filteredEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className="overview-activity-item"
                  onClick={() => setSelectedEvent(event)}
                >
                  <span className="overview-activity-marker" />
                  <span className="overview-activity-copy">
                    <span>
                      {formatEntity(event.entityType)}
                      {" · "}
                      {formatAction(event.action)}
                    </span>
                    <strong>{event.entityLabel || "Untitled record"}</strong>
                    <small>
                      {event.actor || "Unknown operator"}
                      {event.reason ? ` · ${event.reason}` : ""}
                    </small>
                  </span>
                  <time dateTime={event.createdAt}>
                    {formatDateTime(event.createdAt)}
                  </time>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer activity-history-footer">
          {exportError ? (
            <span
              className="activity-history-export-message error"
              role="alert"
            >
              {exportError}
            </span>
          ) : exportedCount !== null ? (
            <span
              className="activity-history-export-message success"
              role="status"
            >
              Exported {exportedCount}{" "}
              {exportedCount === 1 ? "record" : "records"}.
            </span>
          ) : null}
          <button
            type="button"
            className="secondary-button"
            disabled={isExporting}
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={
              isLoading ||
              isExporting ||
              loadError !== null ||
              filteredEvents.length === 0
            }
            onClick={() => void handleExport()}
          >
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default ActivityHistoryModal;
