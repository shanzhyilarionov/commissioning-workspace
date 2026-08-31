import { useEffect, useMemo } from "react";
import {
  formatAuditDetailValue,
  formatAuditFieldName,
  getAuditEventDetails,
} from "../services/auditEventDetails";
import type { AuditEntityType, AuditEvent } from "../types/audit";

interface AuditEventDetailModalProps {
  event: AuditEvent | null;
  onClose: () => void;
  onOpenRecord: (event: AuditEvent) => void;
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

function canOpenRecord(event: AuditEvent): boolean {
  return event.entityType !== "project" && event.action !== "deleted";
}

function getStatusValueClassName(
  event: AuditEvent,
  field: string,
  value: unknown,
): string | undefined {
  if (
    formatAuditFieldName(field) !== "Status" ||
    typeof value !== "string"
  ) {
    return undefined;
  }

  const normalizedStatus = value.trim().toLowerCase().replace(/\s+/g, "_");

  return `audit-event-status-value ${event.entityType} ${normalizedStatus}`;
}

function AuditEventDetailModal({
  event,
  onClose,
  onOpenRecord,
}: AuditEventDetailModalProps) {
  const details = useMemo(
    () => (event ? getAuditEventDetails(event) : null),
    [event],
  );

  useEffect(() => {
    if (!event) {
      return;
    }

    function handleKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [event, onClose]);

  if (!event || !details) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal audit-event-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-event-title"
      >
        <div className="audit-event-scroll">
          <div className="modal-body audit-event-body">
            <div className="audit-event-heading">
              <div>
                <h2 id="audit-event-title" className="modal-form-title">
                  Activity details
                </h2>
                <p>{event.entityLabel || "Untitled record"}</p>
              </div>
            </div>

            <dl className="audit-event-card audit-event-metadata">
              <div>
                <dt>Record type</dt>
                <dd>{formatEntity(event.entityType)}</dd>
              </div>
              <div>
                <dt>Operator</dt>
                <dd>{event.actor || "-"}</dd>
              </div>
              <div>
                <dt>Date and time</dt>
                <dd>{formatDateTime(event.createdAt)}</dd>
              </div>
            </dl>

            {event.reason && (
              <section className="audit-event-section">
                <h3>Reason</h3>
                <p className="audit-event-card audit-event-reason">
                  {event.reason}
                </p>
              </section>
            )}

            {details.changes.length > 0 && (
              <section className="audit-event-section">
                <h3>Changes</h3>
                <div className="audit-event-card audit-change-table">
                  {details.changes.map((change) => (
                    <dl
                      key={change.field}
                      className="audit-change-row"
                    >
                      <div>
                        <dt>Field</dt>
                        <dd>{formatAuditFieldName(change.field)}</dd>
                      </div>
                      <div>
                        <dt>Before</dt>
                        <dd
                          className={getStatusValueClassName(
                            event,
                            change.field,
                            change.before,
                          )}
                        >
                          {formatAuditDetailValue(change.before)}
                        </dd>
                      </div>
                      <div>
                        <dt>After</dt>
                        <dd
                          className={getStatusValueClassName(
                            event,
                            change.field,
                            change.after,
                          )}
                        >
                          {formatAuditDetailValue(change.after)}
                        </dd>
                      </div>
                    </dl>
                  ))}
                </div>
              </section>
            )}

            {details.values.length > 0 && (
              <section className="audit-event-section">
                <h3>Recorded values</h3>
                <dl className="audit-event-card audit-event-values">
                  {details.values.map((detail) => (
                    <div key={detail.field}>
                      <dt>{formatAuditFieldName(detail.field)}</dt>
                      <dd
                        className={getStatusValueClassName(
                          event,
                          detail.field,
                          detail.value,
                        )}
                      >
                        {formatAuditDetailValue(detail.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {details.changes.length === 0 && details.values.length === 0 && (
              <div className="audit-event-card audit-event-empty">
                No additional field details were recorded for this event.
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
          {canOpenRecord(event) && (
            <button
              type="button"
              className="primary-button"
              onClick={() => onOpenRecord(event)}
            >
              Open record
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export default AuditEventDetailModal;
