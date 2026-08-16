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

function canOpenRecord(event: AuditEvent): boolean {
  return event.entityType !== "project" && event.action !== "deleted";
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
              <span className="audit-event-action">
                {formatAction(event.action)}
              </span>
            </div>

            <dl className="audit-event-metadata">
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
                <p>{event.reason}</p>
              </section>
            )}

            {details.changes.length > 0 && (
              <section className="audit-event-section">
                <h3>Changes</h3>
                <div className="audit-change-table" role="table">
                  <div className="audit-change-row audit-change-header" role="row">
                    <span role="columnheader">Field</span>
                    <span role="columnheader">Before</span>
                    <span role="columnheader">After</span>
                  </div>
                  {details.changes.map((change) => (
                    <div
                      key={change.field}
                      className="audit-change-row"
                      role="row"
                    >
                      <strong role="cell">
                        {formatAuditFieldName(change.field)}
                      </strong>
                      <span role="cell">
                        {formatAuditDetailValue(change.before)}
                      </span>
                      <span role="cell">
                        {formatAuditDetailValue(change.after)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {details.values.length > 0 && (
              <section className="audit-event-section">
                <h3>Recorded values</h3>
                <dl className="audit-event-values">
                  {details.values.map((detail) => (
                    <div key={detail.field}>
                      <dt>{formatAuditFieldName(detail.field)}</dt>
                      <dd>{formatAuditDetailValue(detail.value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {details.changes.length === 0 && details.values.length === 0 && (
              <div className="audit-event-empty">
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
