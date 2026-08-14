import { useEffect, useState } from "react";
import { getProjectOverview } from "../repositories/projectOverviewRepository";
import { listAuditEvents } from "../repositories/auditRepository";
import type { AttentionDestinationPage } from "../components/AttentionFocusManager";
import type { Project } from "../types/project";
import type {
  AuditEntityType,
  AuditEvent,
} from "../types/audit";
import type {
  AttentionItemType,
  ProjectAttentionItem,
  ProjectOverview,
} from "../types/projectOverview";

interface ProjectOverviewPageProps {
  currentProject: Project;
  onNavigate: (
    page: AttentionDestinationPage,
    item?: ProjectAttentionItem,
  ) => void;
  onEditProject: () => void;
}

function formatProjectStatus(status: Project["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-CA");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatAuditAction(action: string): string {
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAuditEntity(type: AuditEntityType): string {
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

function getAuditTarget(
  type: AuditEntityType,
): AttentionDestinationPage | null {
  switch (type) {
    case "system":
    case "subsystem":
    case "asset":
      return "Assets";
    case "test_record":
    case "test_item":
      return "Checklists & Tests";
    case "issue":
      return "Issues";
    case "document":
      return "Documents";
    case "turnover_package":
      return "Reports";
    case "project":
      return null;
  }
}

function calculatePercent(completed: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Math.round((completed / total) * 100);
}

function getAttentionLabel(type: AttentionItemType): string {
  switch (type) {
    case "overdue_issue":
      return "Overdue issue";
    case "critical_issue":
      return "Critical issue";
    case "failed_test_item":
      return "Failed test item";
    case "pending_test_item":
      return "Pending test item";
    case "unsigned_test_record":
      return "Unsigned test record";
    case "blocked_asset":
      return "Blocked asset";
    case "incomplete_asset":
      return "Incomplete asset";
    case "required_document":
      return "Required document";
    case "system_readiness":
      return "System readiness";
  }
}

function getAttentionTarget(
  type: AttentionItemType,
): AttentionDestinationPage {
  switch (type) {
    case "blocked_asset":
    case "incomplete_asset":
    case "system_readiness":
      return "Assets";
    case "failed_test_item":
    case "pending_test_item":
    case "unsigned_test_record":
      return "Checklists & Tests";
    case "required_document":
      return "Documents";
    case "overdue_issue":
    case "critical_issue":
      return "Issues";
  }
}

function ProjectOverviewPage({
  currentProject,
  onNavigate,
  onEditProject,
}: ProjectOverviewPageProps) {
  const [overview, setOverview] = useState<ProjectOverview | null>(
    null,
  );
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [nextOverview, nextAuditEvents] = await Promise.all([
          getProjectOverview(currentProject.id),
          listAuditEvents(currentProject.id, 12),
        ]);

        if (!cancelled) {
          setOverview(nextOverview);
          setAuditEvents(nextAuditEvents);
        }
      } catch (error) {
        if (!cancelled) {
          setOverview(null);
          setAuditEvents([]);
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load the project overview.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, [currentProject.id, reloadKey]);

  const assetProgress = overview
    ? calculatePercent(
        overview.assets.completed,
        overview.assets.total,
      )
    : 0;
  const testRecordProgress = overview
    ? calculatePercent(
        overview.testRecords.completed,
        overview.testRecords.total,
      )
    : 0;
  const issueResolutionProgress = overview
    ? calculatePercent(
        overview.issues.resolved + overview.issues.closed,
        overview.issues.total,
      )
    : 0;

  return (
    <section className="content-card section-card overview-page">
      <div className="card-header overview-page-header">
        <div>
          <h3>Project overview</h3>
          <p>Current project: {currentProject.name}</p>
        </div>
        <span
          className={`status-badge ${currentProject.status}`}
        >
          {formatProjectStatus(currentProject.status)}
        </span>
      </div>

      <div className="overview-scroll-container">
        <div className="section-body overview-body">
        {isLoading ? (
          <div className="overview-state">
            <h3>Loading project overview</h3>
            <p>
              Calculating commissioning progress and outstanding work.
            </p>
          </div>
        ) : loadError ? (
          <div className="overview-state">
            <h3>Unable to load project overview</h3>
            <p>{loadError}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              Try again
            </button>
          </div>
        ) : overview ? (
          <>
            <div className="overview-metrics-grid">
              <button
                type="button"
                className="overview-metric-card"
                onClick={() => onNavigate("Assets")}
              >
                <span className="overview-metric-label">Assets</span>
                <strong>{overview.assets.total}</strong>
                <span className="overview-metric-detail">
                  {overview.assets.completed} completed ·{" "}
                  {overview.assets.blocked} blocked
                </span>
              </button>

              <button
                type="button"
                className="overview-metric-card"
                onClick={() => onNavigate("Checklists & Tests")}
              >
                <span className="overview-metric-label">
                  Test records
                </span>
                <strong>{overview.testRecords.total}</strong>
                <span className="overview-metric-detail">
                  {overview.testRecords.completed} completed ·{" "}
                  {overview.testRecords.blocked} blocked
                </span>
              </button>

              <button
                type="button"
                className="overview-metric-card"
                onClick={() => onNavigate("Checklists & Tests")}
              >
                <span className="overview-metric-label">
                  Test items
                </span>
                <strong>{overview.testItems.completionPercent}%</strong>
                <span className="overview-metric-detail">
                  {overview.testItems.passed} passed ·{" "}
                  {overview.testItems.failed} failed
                </span>
              </button>

              <button
                type="button"
                className="overview-metric-card"
                onClick={() => onNavigate("Issues")}
              >
                <span className="overview-metric-label">
                  Active issues
                </span>
                <strong>{overview.issues.active}</strong>
                <span className="overview-metric-detail">
                  {overview.issues.critical} critical ·{" "}
                  {overview.issues.overdue} overdue
                </span>
              </button>
            </div>

            <div className="overview-content-grid">
              <section className="overview-panel overview-progress-panel">
                <div className="overview-panel-header">
                  <div>
                    <h4>Commissioning progress</h4>
                    <p>Completion across the current project.</p>
                  </div>
                </div>

                <div className="overview-progress-list">
                  <div className="overview-progress-row">
                    <div className="overview-progress-heading">
                      <span>Assets</span>
                      <strong>{assetProgress}%</strong>
                    </div>
                    <div
                      className="overview-progress-track"
                      role="progressbar"
                      aria-label="Asset completion"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={assetProgress}
                    >
                      <span style={{ width: `${assetProgress}%` }} />
                    </div>
                    <p>
                      {overview.assets.completed} of{" "}
                      {overview.assets.total} completed
                    </p>
                  </div>

                  <div className="overview-progress-row">
                    <div className="overview-progress-heading">
                      <span>Test records</span>
                      <strong>{testRecordProgress}%</strong>
                    </div>
                    <div
                      className="overview-progress-track"
                      role="progressbar"
                      aria-label="Test record completion"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={testRecordProgress}
                    >
                      <span
                        style={{ width: `${testRecordProgress}%` }}
                      />
                    </div>
                    <p>
                      {overview.testRecords.completed} of{" "}
                      {overview.testRecords.total} completed
                    </p>
                  </div>

                  <div className="overview-progress-row">
                    <div className="overview-progress-heading">
                      <span>Test items assessed</span>
                      <strong>
                        {overview.testItems.completionPercent}%
                      </strong>
                    </div>
                    <div
                      className="overview-progress-track"
                      role="progressbar"
                      aria-label="Test item completion"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={
                        overview.testItems.completionPercent
                      }
                    >
                      <span
                        style={{
                          width: `${overview.testItems.completionPercent}%`,
                        }}
                      />
                    </div>
                    <p>
                      {overview.testItems.completed} of{" "}
                      {overview.testItems.total} assessed
                    </p>
                  </div>

                  <div className="overview-progress-row">
                    <div className="overview-progress-heading">
                      <span>Issues resolved</span>
                      <strong>{issueResolutionProgress}%</strong>
                    </div>
                    <div
                      className="overview-progress-track"
                      role="progressbar"
                      aria-label="Issue resolution"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={issueResolutionProgress}
                    >
                      <span
                        style={{ width: `${issueResolutionProgress}%` }}
                      />
                    </div>
                    <p>
                      {overview.issues.resolved + overview.issues.closed}{" "}
                      of {overview.issues.total} resolved or closed
                    </p>
                  </div>
                </div>
              </section>

              <section className="overview-panel overview-attention-panel">
                <div className="overview-panel-header">
                  <div>
                    <h4>Attention required</h4>
                    <p>
                      Highest-priority items requiring follow-up.
                    </p>
                  </div>
                </div>

                {overview.attentionItems.length === 0 ? (
                  <div className="overview-attention-empty">
                    <strong>No urgent items</strong>
                    <span>
                      No blocked assets, failed tests, critical issues,
                      overdue issues, or system readiness blockers were found.
                    </span>
                  </div>
                ) : (
                  <div className="overview-attention-list">
                    {overview.attentionItems.map((item) => (
                      <button
                        key={`${item.type}-${item.id}`}
                        type="button"
                        className="overview-attention-item"
                        onClick={() =>
                          onNavigate(
                            getAttentionTarget(item.type),
                            item,
                          )
                        }
                      >
                        <span className="overview-attention-copy">
                          <span className="overview-attention-kind">
                            {getAttentionLabel(item.type)}
                          </span>
                          <strong>{item.title}</strong>
                          <span>{item.detail}</span>
                        </span>
                        <span
                          className={`status-badge ${item.status}`}
                        >
                          {formatStatus(item.status)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="overview-panel overview-activity-panel">
              <div className="overview-panel-header">
                <div>
                  <h4>Recent activity</h4>
                  <p>Append-only project changes and controlled actions.</p>
                </div>
              </div>

              {auditEvents.length === 0 ? (
                <div className="overview-activity-empty">
                  <strong>No recorded activity yet</strong>
                  <span>New changes will appear here automatically.</span>
                </div>
              ) : (
                <div className="overview-activity-list">
                  {auditEvents.map((event) => {
                    const target = getAuditTarget(event.entityType);
                    const content = (
                      <>
                        <span className="overview-activity-marker" />
                        <span className="overview-activity-copy">
                          <span>
                            {formatAuditEntity(event.entityType)}
                            {" · "}
                            {formatAuditAction(event.action)}
                          </span>
                          <strong>{event.entityLabel || "Untitled record"}</strong>
                          <small>
                            {event.actor}
                            {event.reason ? ` · ${event.reason}` : ""}
                          </small>
                        </span>
                        <time dateTime={event.createdAt}>
                          {formatDateTime(event.createdAt)}
                        </time>
                      </>
                    );

                    return target ? (
                      <button
                        key={event.id}
                        type="button"
                        className="overview-activity-item"
                        onClick={() => onNavigate(target)}
                      >
                        {content}
                      </button>
                    ) : (
                      <div
                        key={event.id}
                        className="overview-activity-item"
                      >
                        {content}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="overview-panel overview-project-panel">
              <div className="overview-panel-header">
                <div>
                  <h4>Project details</h4>
                  <p>Reference information for the current project.</p>
                </div>
                <button
                  type="button"
                  className="secondary-button overview-project-edit-button"
                  onClick={onEditProject}
                >
                  Edit details
                </button>
              </div>

              <div className="overview-project-grid">
                <div>
                  <span>Client</span>
                  <strong>{currentProject.client || "—"}</strong>
                </div>
                <div>
                  <span>Location</span>
                  <strong>{currentProject.location || "—"}</strong>
                </div>
                <div>
                  <span>Created</span>
                  <strong>{formatDate(currentProject.createdAt)}</strong>
                </div>
                <div>
                  <span>Updated</span>
                  <strong>{formatDate(currentProject.updatedAt)}</strong>
                </div>
              </div>

              <div className="overview-project-description">
                <span>Description</span>
                <strong>
                  {currentProject.description || "No description."}
                </strong>
              </div>
            </section>
          </>
        ) : null}
        </div>
      </div>
    </section>
  );
}

export default ProjectOverviewPage;
