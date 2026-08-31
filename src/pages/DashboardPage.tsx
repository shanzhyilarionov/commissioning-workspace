import { useEffect, useState } from "react";
import ActivityHistoryModal from "../components/ActivityHistoryModal";
import AuditEventDetailModal from "../components/AuditEventDetailModal";
import type { AttentionDestinationPage } from "../components/AttentionFocusManager";
import { listAuditEvents } from "../repositories/auditRepository";
import { getProjectOverview } from "../repositories/projectOverviewRepository";
import type {
  AuditEntityType,
  AuditEvent,
} from "../types/audit";
import type { ProjectNavigationItem } from "../types/navigation";
import type { Project } from "../types/project";
import type {
  ProjectOverview,
  ProjectOverviewScopeStages,
} from "../types/projectOverview";

interface ProjectOverviewPageProps {
  currentProject: Project;
  onNavigate: (
    page: AttentionDestinationPage,
    item?: ProjectNavigationItem,
  ) => void;
  onEditProject: () => void;
}

type ScopeChartTone =
  | "positive"
  | "accent"
  | "warning"
  | "info"
  | "neutral";

interface ScopeChartSegment {
  label: string;
  value: number;
  tone: ScopeChartTone;
}

interface ReadinessRowData {
  label: string;
  percent: number;
  total: number;
  remaining: number;
  complete: number;
}

function formatProjectStatus(status: Project["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-CA");
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
      return "Turnover packages";
    case "project":
      return null;
  }
}

function calculatePercent(completed: number, total: number): number {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

function ScopePieChart({
  label,
  stages,
}: {
  label: string;
  stages: ProjectOverviewScopeStages;
}) {
  const segments: ScopeChartSegment[] = [
    {
      label: "Handed over",
      value: stages.handedOver,
      tone: "positive",
    },
    {
      label: "Commissioned",
      value: stages.commissioned,
      tone: "info",
    },
    {
      label: "Ready",
      value: stages.ready,
      tone: "warning",
    },
    {
      label: "In progress",
      value: stages.inProgress,
      tone: "accent",
    },
    {
      label: "Not started",
      value: stages.notStarted,
      tone: "neutral",
    },
  ];
  const total = segments.reduce(
    (sum, segment) => sum + segment.value,
    0,
  );
  let offset = 0;

  return (
    <section className="home-panel home-pie-card overview-scope-pie-card">
      <div className="home-pie-card-heading">
        <h5>{label}</h5>
      </div>
      <div className="home-pie-card-body">
        <div className="home-pie-legend">
          {segments.map((segment) => (
            <div key={segment.label}>
              <span className={`home-chart-key ${segment.tone}`} />
              <span>
                {segment.label} <strong>{segment.value}</strong>
              </span>
            </div>
          ))}
        </div>
        <div
          className="home-pie-visual"
          role="img"
          aria-label={`${label}: ${segments
            .map((segment) => `${segment.value} ${segment.label}`)
            .join(", ")}.`}
        >
          <svg
            className="home-pie"
            viewBox="0 0 120 120"
            aria-hidden="true"
          >
            <circle
              className="home-pie-track"
              cx="60"
              cy="60"
              r="25"
              pathLength="100"
            />
            {segments.map((segment) => {
              const percentage =
                total === 0 ? 0 : (segment.value / total) * 100;
              const segmentOffset = offset;
              offset += percentage;

              return percentage > 0 ? (
                <circle
                  key={segment.label}
                  className={`home-pie-segment ${segment.tone}`}
                  cx="60"
                  cy="60"
                  r="25"
                  pathLength="100"
                  strokeDasharray={`${percentage} ${100 - percentage}`}
                  strokeDashoffset={-segmentOffset}
                />
              ) : null;
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}

function ProjectOverviewPage({
  currentProject,
  onNavigate,
  onEditProject,
}: ProjectOverviewPageProps) {
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [selectedAuditEvent, setSelectedAuditEvent] =
    useState<AuditEvent | null>(null);
  const [isActivityHistoryOpen, setIsActivityHistoryOpen] =
    useState(false);
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

  function handleOpenAuditRecord(event: AuditEvent) {
    const target = getAuditTarget(event.entityType);

    if (!target) {
      return;
    }

    setSelectedAuditEvent(null);
    onNavigate(target, {
      navigationKind: "audit",
      entityType: event.entityType,
      id: event.entityId,
      matchText: event.entityLabel,
      parentId: event.parentEntityId,
    });
  }

  const assetCompletionPercent = overview
    ? calculatePercent(overview.assets.completed, overview.assets.total)
    : 0;
  const assessedTestItems = overview
    ? overview.testItems.passed + overview.testItems.failed
    : 0;
  const assessedPassRate = overview
    ? calculatePercent(overview.testItems.passed, assessedTestItems)
    : 0;
  const subsystemHandoverPercent = overview
    ? calculatePercent(
        overview.scope.subsystems.handedOver,
        overview.scope.subsystems.total,
      )
    : 0;
  const readinessRows: ReadinessRowData[] = overview
    ? [
        {
          label: "Required documents",
          percent: calculatePercent(
            overview.deliverables.requiredDocumentsApproved,
            overview.deliverables.requiredDocumentsTotal,
          ),
          total: overview.deliverables.requiredDocumentsTotal,
          remaining:
            overview.deliverables.requiredDocumentsTotal -
            overview.deliverables.requiredDocumentsApproved,
          complete: overview.deliverables.requiredDocumentsApproved,
        },
        {
          label: "Test records",
          percent: calculatePercent(
            overview.deliverables.testRecordsSigned,
            overview.deliverables.testRecordsTotal,
          ),
          total: overview.deliverables.testRecordsTotal,
          remaining:
            overview.deliverables.testRecordsTotal -
            overview.deliverables.testRecordsSigned,
          complete: overview.deliverables.testRecordsSigned,
        },
        {
          label: "Subsystem handover",
          percent: calculatePercent(
            overview.deliverables.subsystemsHandedOver,
            overview.deliverables.subsystemsTotal,
          ),
          total: overview.deliverables.subsystemsTotal,
          remaining:
            overview.deliverables.subsystemsTotal -
            overview.deliverables.subsystemsHandedOver,
          complete: overview.deliverables.subsystemsHandedOver,
        },
      ]
    : [];

  return (
    <>
      <section className="content-card section-card overview-page">
        <div className="card-header overview-page-header">
          <h3>{currentProject.name}</h3>
          <span className={`status-badge ${currentProject.status}`}>
            {formatProjectStatus(currentProject.status)}
          </span>
        </div>

        <div className="overview-scroll-container">
          <div className="section-body overview-body">
            {isLoading ? (
              <div className="overview-state">
                <span className="home-analytics-loader" />
                <h3>Preparing the project overview</h3>
                <p>Calculating readiness, closeout, and outstanding work.</p>
              </div>
            ) : loadError ? (
              <div className="overview-state">
                <h3>Unable to load the project overview</h3>
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
                <div
                  className="home-project-metrics"
                  aria-label="Project commissioning summary"
                >
                  <div
                    className={`home-project-metric ${
                      overview.assets.total === 0
                        ? "neutral"
                        : assetCompletionPercent === 100
                          ? "positive"
                          : "accent"
                    }`}
                  >
                    <span>Asset completion</span>
                    <strong>
                      {overview.assets.total === 0
                        ? "-"
                        : `${assetCompletionPercent}%`}
                    </strong>
                    <small>
                      {overview.assets.total === 0
                        ? "No assets recorded"
                        : `${overview.assets.completed} of ${overview.assets.total} assets`}
                    </small>
                  </div>
                  <div
                    className={`home-project-metric ${
                      assessedTestItems === 0
                        ? "neutral"
                        : assessedPassRate === 100
                          ? "positive"
                          : assessedPassRate >= 90
                            ? "accent"
                            : "negative"
                    }`}
                  >
                    <span>Assessed test pass rate</span>
                    <strong>
                      {assessedTestItems === 0
                        ? "-"
                        : `${assessedPassRate}%`}
                    </strong>
                    <small>
                      {assessedTestItems === 0
                        ? "No assessed test items"
                        : `${overview.testItems.passed} passed · ${overview.testItems.failed} failed`}
                    </small>
                  </div>
                  <div
                    className={`home-project-metric ${
                      overview.issues.active > 0
                        ? "negative"
                        : "positive"
                    }`}
                  >
                    <span>Active issues</span>
                    <strong>{overview.issues.active}</strong>
                    <small>
                      {overview.issues.active === 0
                        ? "No issues need attention"
                        : `${overview.issues.critical} critical · ${overview.issues.overdue} overdue`}
                    </small>
                  </div>
                  <div
                    className={`home-project-metric ${
                      overview.scope.subsystems.total === 0
                        ? "neutral"
                        : subsystemHandoverPercent === 100
                          ? "positive"
                          : "accent"
                    }`}
                  >
                    <span>Subsystem handover</span>
                    <strong>
                      {overview.scope.subsystems.total === 0
                        ? "-"
                        : `${subsystemHandoverPercent}%`}
                    </strong>
                    <small>
                      {overview.scope.subsystems.total === 0
                        ? "No subsystems recorded"
                        : `${overview.scope.subsystems.handedOver} of ${overview.scope.subsystems.total} handed over`}
                    </small>
                  </div>
                </div>

                <div className="home-closeout-row overview-closeout-row">
                  <section
                    className="home-panel home-attention-panel"
                    aria-label="Immediate attention"
                    title="Critical active and overdue active issue counts may overlap."
                  >
                    <h4>Immediate attention</h4>
                    <div className="home-attention-items">
                      <div>
                        <span>Critical active</span>
                        <strong>{overview.issues.critical}</strong>
                      </div>
                      <div>
                        <span>Overdue active</span>
                        <strong>{overview.issues.overdue}</strong>
                      </div>
                      <div>
                        <span>Failed test items</span>
                        <strong>{overview.testItems.failed}</strong>
                      </div>
                      <div>
                        <span>Blocked assets</span>
                        <strong>{overview.assets.blocked}</strong>
                      </div>
                    </div>
                  </section>

                  <section
                    className="home-panel home-readiness-panel"
                    aria-label="Deliverables readiness"
                  >
                    <div className="home-readiness-heading">
                      <h4>Deliverables readiness</h4>
                    </div>
                    <div
                      className="home-readiness-table-header"
                      aria-hidden="true"
                    >
                      <span>Workstream</span>
                      <span>Progress</span>
                      <span>Total</span>
                      <span>Outstanding</span>
                      <span>Ready</span>
                    </div>
                    <div className="home-readiness-table-body">
                      {readinessRows.map((row) => (
                        <div className="home-readiness-row" key={row.label}>
                          <strong>{row.label}</strong>
                          <div className="home-readiness-progress-cell">
                            <div
                              className="home-readiness-progress"
                              role="progressbar"
                              aria-label={`${row.label} readiness`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={row.percent}
                            >
                              <span style={{ width: `${row.percent}%` }} />
                            </div>
                            <small>{row.percent}%</small>
                          </div>
                          <span className="total">{row.total}</span>
                          <span className="remaining">{row.remaining}</span>
                          <span className="complete">{row.complete}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <div className="overview-dashboard-main-row">
                  <div className="overview-scope-pie-grid">
                    <ScopePieChart
                      label="Systems"
                      stages={overview.scope.systems}
                    />
                    <ScopePieChart
                      label="Subsystems"
                      stages={overview.scope.subsystems}
                    />
                  </div>

                  <section className="home-panel overview-dashboard-activity-panel">
                    <div className="home-panel-header overview-centered-panel-heading">
                      <h4>Recent activity</h4>
                      {auditEvents.length > 0 && (
                        <button
                          type="button"
                          className="secondary-button overview-activity-view-all"
                          onClick={() => setIsActivityHistoryOpen(true)}
                        >
                          View all
                        </button>
                      )}
                    </div>

                    {auditEvents.length === 0 ? (
                      <div className="overview-activity-empty">
                        <strong>No recorded activity yet</strong>
                        <span>New changes will appear here automatically.</span>
                      </div>
                    ) : (
                      <div className="overview-activity-list overview-dashboard-activity-list">
                        {auditEvents.map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            className="overview-activity-item"
                            onClick={() => setSelectedAuditEvent(event)}
                          >
                            <span className="overview-activity-copy">
                              <strong>
                                {event.entityLabel || "Untitled record"}
                              </strong>
                              <small>
                                {event.actor}
                                {" · "}
                                {event.reason ||
                                  formatAuditAction(event.action)}
                              </small>
                            </span>
                            <time dateTime={event.createdAt}>
                              {formatDateTime(event.createdAt)}
                            </time>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                <section className="home-panel overview-project-panel">
                  <div className="home-panel-header overview-centered-panel-heading">
                    <h4>Project details</h4>
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
                      <strong>{currentProject.client || "-"}</strong>
                    </div>
                    <div>
                      <span>Location</span>
                      <strong>{currentProject.location || "-"}</strong>
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

      <ActivityHistoryModal
        isOpen={isActivityHistoryOpen}
        projectId={currentProject.id}
        projectName={currentProject.name}
        onClose={() => setIsActivityHistoryOpen(false)}
        onOpenRecord={handleOpenAuditRecord}
      />

      <AuditEventDetailModal
        event={selectedAuditEvent}
        onClose={() => setSelectedAuditEvent(null)}
        onOpenRecord={handleOpenAuditRecord}
      />
    </>
  );
}

export default ProjectOverviewPage;
