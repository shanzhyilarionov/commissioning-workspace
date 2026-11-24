import { useEffect, useState } from "react";
import FixedHeaderTable from "../components/FixedHeaderTable";
import PieChart, { type PieChartSegment } from "../components/PieChart";
import { progressWidthStyle } from "../styles/layout/progress";
import { useWeeklyActivityChartLayout } from "../styles/layout/useWeeklyActivityChartLayout";
import { getWorkspaceAnalytics } from "../repositories/workspaceAnalyticsRepository";
import type { ContinueWorkingItem } from "../services/continueWorkingService";
import type { WorkspaceDeliverableKind } from "../types/workspaceDeliverable";
import type {
  WorkspaceAnalytics,
  WorkspaceDailyActivity,
  WorkspaceProjectPerformance,
} from "../types/workspaceAnalytics";

interface HomePageProps {
  currentOperatorName: string;
  continueWorkingItem: ContinueWorkingItem | null;
  onContinueWorking: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenDeliverables: (kind: WorkspaceDeliverableKind) => void;
}

type DashboardTone = "positive" | "accent" | "negative" | "neutral";

function formatRelativeTime(value: string, currentTime: Date): string {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Recently";
  }

  const elapsedMinutes = Math.max(
    0,
    Math.floor((currentTime.getTime() - timestamp.getTime()) / 60_000),
  );

  if (elapsedMinutes < 1) {
    return "Just now";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `${elapsedHours} ${elapsedHours === 1 ? "hour" : "hours"} ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);

  if (elapsedDays < 7) {
    return `${elapsedDays} ${elapsedDays === 1 ? "day" : "days"} ago`;
  }

  return timestamp.toLocaleDateString("en-CA");
}

function formatPerformanceFraction(
  complete: number,
  total: number,
): string {
  return total === 0 ? "-" : `${complete}/${total}`;
}

function ContinueWorkingPanel({
  item,
  currentTime,
  onContinue,
}: {
  item: ContinueWorkingItem | null;
  currentTime: Date;
  onContinue: () => void;
}) {
  return (
    <section
      className="home-panel home-continue-working-panel"
      aria-label="Continue working"
    >
      <div className="home-compact-panel-heading">
        <h4>Continue working</h4>
      </div>

      {item ? (
        <div className="home-continue-working-body">
          <div className="home-continue-working-copy">
            <span>
              {item.isFallback
                ? "Most recently updated project"
                : "Last opened"}
            </span>
            <strong title={item.projectName}>{item.projectName}</strong>
            <small>
              {item.page} · {formatRelativeTime(item.visitedAt, currentTime)}
            </small>
          </div>

          <button
            className="secondary-button home-continue-working-button"
            type="button"
            onClick={onContinue}
          >
            {item.isFallback ? "Open project" : "Resume"}
          </button>
        </div>
      ) : (
        <div className="home-continue-working-empty">
          <strong>Nothing to resume yet</strong>
          <span>Open a project to begin working.</span>
        </div>
      )}
    </section>
  );
}

function ProjectPerformanceValue({
  complete,
  total,
  tone,
}: {
  complete: number;
  total: number;
  tone: DashboardTone;
}) {
  return (
    <span className={`home-performance-fraction ${tone}`}>
      {formatPerformanceFraction(complete, total)}
    </span>
  );
}

function ProjectPerformancePanel({
  projects,
  onOpenProject,
}: {
  projects: WorkspaceProjectPerformance[];
  onOpenProject: (projectId: string) => void;
}) {
  return (
    <section
      className="home-panel home-project-performance-panel"
      aria-label="Project performance"
    >
      <div className="home-compact-panel-heading">
        <h4>Project performance</h4>
      </div>

      {projects.length === 0 ? (
        <div className="home-project-performance-empty">
          <strong>No active projects</strong>
          <span>Restore or create a project to compare performance.</span>
        </div>
      ) : (
        <FixedHeaderTable
          className="projects-table home-project-performance-table"
          wrapperClassName="home-project-performance-table-wrapper"
          ariaLabel="Active project performance"
          header={
            <tr>
              <th>Project</th>
              <th className="numeric-column">Assets</th>
              <th className="numeric-column">Tests</th>
              <th className="numeric-column">Active issues</th>
              <th className="numeric-column">Subsystem handover</th>
            </tr>
          }
          body={
            <>
              {projects.map((project) => (
                <tr
                  key={project.projectId}
                  onClick={() => onOpenProject(project.projectId)}
                >
                  <td className="home-performance-project-cell">
                    <button
                      className="home-performance-project-button"
                      type="button"
                      aria-label={`Open overview for ${project.projectName}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenProject(project.projectId);
                      }}
                    >
                      {project.projectName}
                    </button>
                  </td>
                  <td className="numeric-column">
                    <ProjectPerformanceValue
                      complete={project.assetCompleted}
                      total={project.assetTotal}
                      tone={
                        project.assetTotal === 0
                          ? "neutral"
                          : project.assetCompleted === project.assetTotal
                            ? "positive"
                            : "accent"
                      }
                    />
                  </td>
                  <td className="numeric-column">
                    <ProjectPerformanceValue
                      complete={project.passedTestItems}
                      total={project.assessedTestItems}
                      tone={
                        project.assessedTestItems === 0
                          ? "neutral"
                          : project.passedTestItems ===
                              project.assessedTestItems
                            ? "positive"
                            : project.passedTestItems /
                                  project.assessedTestItems >=
                                0.9
                              ? "accent"
                              : "negative"
                      }
                    />
                  </td>
                  <td
                    className={
                      project.activeIssues > 0
                        ? "numeric-column home-performance-issues attention"
                        : "numeric-column home-performance-issues clear"
                    }
                    title={
                      project.activeIssues > 0
                        ? `${project.criticalIssues} critical · ${project.overdueIssues} overdue`
                        : "No active issues"
                    }
                  >
                    {project.activeIssues}
                  </td>
                  <td className="numeric-column">
                    <ProjectPerformanceValue
                      complete={project.subsystemsHandedOver}
                      total={project.subsystemTotal}
                      tone={
                        project.subsystemTotal === 0
                          ? "neutral"
                          : project.subsystemsHandedOver ===
                              project.subsystemTotal
                            ? "positive"
                            : "accent"
                      }
                    />
                  </td>
                </tr>
              ))}
            </>
          }
        />
      )}
    </section>
  );
}

function getGreetingContent(date: Date, operatorName: string) {
  const hour = date.getHours();
  const name = operatorName.trim();
  const namedEnding = name ? `, ${name}` : "";

  if (hour >= 5 && hour < 12) {
    return {
      title: `Good morning${namedEnding}!`,
      subtitle:
        "Ready to get started? Here is the latest across your workspace.",
    };
  }

  if (hour >= 12 && hour < 18) {
    return {
      title: `Good afternoon${namedEnding}!`,
      subtitle:
        "Here is how your commissioning work is moving along today.",
    };
  }

  return {
    title: `Good evening${namedEnding}!`,
    subtitle:
      "Here is where everything stands before you wrap up for the day.",
  };
}

function WeeklyActivityChart({
  activity,
}: {
  activity: WorkspaceDailyActivity[];
}) {
  const {
    containerRef,
    tickCount,
    showDataPoints,
    labelIndexes,
    width,
    height,
    chartLeft,
    chartTop,
    chartWidth,
    chartHeight,
    pointRadius,
    plotStyle,
    labelsStyle,
  } = useWeeklyActivityChartLayout(activity.length);
  const maximumValue = Math.max(
    1,
    ...activity.flatMap((point) => [
      point.created,
      point.closedOut,
    ]),
  );
  const xForIndex = (index: number) =>
    chartLeft +
    (activity.length <= 1
      ? chartWidth / 2
      : (index / (activity.length - 1)) * chartWidth);
  const yForValue = (value: number) =>
    chartTop + chartHeight - (value / maximumValue) * chartHeight;
  const createdPoints = activity.map(
    (point, index) =>
      `${xForIndex(index)},${yForValue(point.created)}`,
  );
  const closedOutPoints = activity.map(
    (point, index) =>
      `${xForIndex(index)},${yForValue(point.closedOut)}`,
  );
  const createdArea = [
    `${chartLeft},${chartTop + chartHeight}`,
    ...createdPoints,
    `${chartLeft + chartWidth},${chartTop + chartHeight}`,
  ].join(" ");
  const closedOutArea = [
    `${chartLeft},${chartTop + chartHeight}`,
    ...closedOutPoints,
    `${chartLeft + chartWidth},${chartTop + chartHeight}`,
  ].join(" ");
  const tickValues = Array.from({ length: tickCount }, (_, index) =>
    Math.round(
      maximumValue * (1 - index / Math.max(1, tickCount - 1)),
    ),
  );

  return (
    <div className="home-weekly-chart" ref={containerRef}>
      <div className="home-chart-legend-inline" aria-hidden="true">
        <span>
          <i className="created" /> Created
        </span>
        <span>
          <i className="closed-out" /> Closed out
        </span>
      </div>
      <div className="home-chart-plot">
        <div className="home-chart-y-labels" aria-hidden="true">
          {tickValues.map((tickValue, index) => (
            <span key={`${tickValue}-${index}`}>
              {tickValue}
            </span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={plotStyle}
          role="img"
          aria-label={`Daily workspace activity chart. ${activity
            .map(
              (week) =>
                `${week.label}: ${week.created} created and ${week.closedOut} closed out`,
            )
            .join(". ")}.`}
        >
          {tickValues.map((tickValue, index) => {
            const y =
              chartTop +
              (index / (tickValues.length - 1)) * chartHeight;

            return (
              <line
                key={`${tickValue}-${index}`}
                className="home-chart-grid-line"
                x1={chartLeft}
                x2={chartLeft + chartWidth}
                y1={y}
                y2={y}
              />
            );
          })}

          <polygon
            className="home-chart-area created"
            points={createdArea}
          />
          <polygon
            className="home-chart-area closed-out"
            points={closedOutArea}
          />
          <polyline
            className="home-chart-line created"
            points={createdPoints.join(" ")}
          />
          <polyline
            className="home-chart-line closed-out"
            points={closedOutPoints.join(" ")}
          />

          {showDataPoints
            ? activity.map((point, index) =>
                point.created > 0 || point.closedOut > 0 ? (
                  <g key={point.startDate}>
                    {point.created > 0 ? (
                      <>
                        <circle
                          className="home-chart-point-halo"
                          cx={xForIndex(index)}
                          cy={yForValue(point.created)}
                          r={pointRadius}
                        />
                        <circle
                          className="home-chart-point created"
                          cx={xForIndex(index)}
                          cy={yForValue(point.created)}
                          r={pointRadius}
                        />
                      </>
                    ) : null}
                    {point.closedOut > 0 ? (
                      <>
                        <circle
                          className="home-chart-point-halo"
                          cx={xForIndex(index)}
                          cy={yForValue(point.closedOut)}
                          r={pointRadius}
                        />
                        <circle
                          className="home-chart-point closed-out"
                          cx={xForIndex(index)}
                          cy={yForValue(point.closedOut)}
                          r={pointRadius}
                        />
                      </>
                    ) : null}
                  </g>
                ) : null,
              )
            : null}
        </svg>
      </div>
      <div
        className="home-chart-x-labels"
        style={labelsStyle}
        aria-hidden="true"
      >
        {activity.map((point, index) => (
          <span key={point.startDate}>
            {labelIndexes.has(index) ? point.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
function AnalyticsContent({
  analytics,
  continueWorkingItem,
  currentTime,
  onContinueWorking,
  onOpenProject,
  onOpenDeliverables,
}: {
  analytics: WorkspaceAnalytics;
  continueWorkingItem: ContinueWorkingItem | null;
  currentTime: Date;
  onContinueWorking: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenDeliverables: (kind: WorkspaceDeliverableKind) => void;
}) {
  const assetCompletionPercent =
    analytics.assets.total === 0
      ? 0
      : Math.round(
          (analytics.assets.completed / analytics.assets.total) * 100,
        );
  const requiredDocumentPercent =
    analytics.deliverables.requiredDocumentsTotal === 0
      ? 0
      : Math.round(
          (analytics.deliverables.requiredDocumentsApproved /
            analytics.deliverables.requiredDocumentsTotal) *
            100,
        );
  const signedRecordPercent =
    analytics.deliverables.testRecordsTotal === 0
      ? 0
      : Math.round(
          (analytics.deliverables.testRecordsSigned /
            analytics.deliverables.testRecordsTotal) *
            100,
        );
  const handoverScopePercent =
    analytics.deliverables.handoverSubsystemsTotal === 0
      ? 0
      : Math.round(
          (analytics.deliverables.handoverSubsystemsComplete /
            analytics.deliverables.handoverSubsystemsTotal) *
            100,
        );
  const readinessRows: {
    kind: WorkspaceDeliverableKind;
    label: string;
    percent: number;
    total: number;
    remaining: number;
    complete: number;
  }[] = [
    {
      kind: "required_documents",
      label: "Required documents",
      percent: requiredDocumentPercent,
      total: analytics.deliverables.requiredDocumentsTotal,
      remaining:
        analytics.deliverables.requiredDocumentsTotal -
        analytics.deliverables.requiredDocumentsApproved,
      complete: analytics.deliverables.requiredDocumentsApproved,
    },
    {
      kind: "test_records",
      label: "Test records",
      percent: signedRecordPercent,
      total: analytics.deliverables.testRecordsTotal,
      remaining:
        analytics.deliverables.testRecordsTotal -
        analytics.deliverables.testRecordsSigned,
      complete: analytics.deliverables.testRecordsSigned,
    },
    {
      kind: "subsystem_handover",
      label: "Subsystem handover",
      percent: handoverScopePercent,
      total: analytics.deliverables.handoverSubsystemsTotal,
      remaining:
        analytics.deliverables.handoverSubsystemsTotal -
        analytics.deliverables.handoverSubsystemsComplete,
      complete: analytics.deliverables.handoverSubsystemsComplete,
    },
  ];
  const assetSegments: PieChartSegment[] = [
    {
      label: "Completed",
      value: analytics.assets.completed,
      tone: "positive",
    },
    {
      label: "In progress",
      value: analytics.assets.inProgress,
      tone: "accent",
    },
    {
      label: "Blocked",
      value: analytics.assets.blocked,
      tone: "negative",
    },
    {
      label: "Not started",
      value: analytics.assets.notStarted,
      tone: "neutral",
    },
  ];
  const testSegments: PieChartSegment[] = [
    {
      label: "Passed",
      value: analytics.tests.passed,
      tone: "positive",
    },
    {
      label: "Failed",
      value: analytics.tests.failed,
      tone: "negative",
    },
    {
      label: "Pending",
      value: analytics.tests.pending,
      tone: "accent",
    },
    {
      label: "N/A",
      value: analytics.tests.notApplicable,
      tone: "neutral",
    },
  ];
  const issueSegments: PieChartSegment[] = [
    {
      label: "Open",
      value: analytics.issues.open,
      tone: "negative",
    },
    {
      label: "In progress",
      value: analytics.issues.inProgress,
      tone: "accent",
    },
    {
      label: "Resolved",
      value: analytics.issues.resolved,
      tone: "positive",
    },
    {
      label: "Closed",
      value: analytics.issues.closed,
      tone: "neutral",
    },
  ];
  return (
    <>
      <div
        className="home-project-metrics"
        aria-label="Workspace commissioning summary"
      >
        <div
          className={`home-project-metric ${
            analytics.assets.total === 0
              ? "neutral"
              : assetCompletionPercent === 100
                ? "positive"
                : "accent"
          }`}
        >
          <span>Asset completion</span>
          <strong>
            {analytics.assets.total === 0
              ? "-"
              : `${assetCompletionPercent}%`}
          </strong>
          <small>
            {analytics.assets.total === 0
              ? "No assets recorded"
              : `${analytics.assets.completed} of ${analytics.assets.total} assets`}
          </small>
        </div>
        <div
          className={`home-project-metric ${
            analytics.tests.assessed === 0
              ? "neutral"
              : analytics.tests.passRate === 100
                ? "positive"
                : analytics.tests.passRate >= 90
                  ? "accent"
                  : "negative"
          }`}
        >
          <span>Assessed test pass rate</span>
          <strong>
            {analytics.tests.assessed === 0
              ? "-"
              : `${analytics.tests.passRate}%`}
          </strong>
          <small>
            {analytics.tests.assessed === 0
              ? "No assessed test items"
              : `${analytics.tests.passed} passed · ${analytics.tests.failed} failed`}
          </small>
        </div>
        <div
          className={`home-project-metric ${
            analytics.issues.active > 0 ? "negative" : "positive"
          }`}
        >
          <span>Active issues</span>
          <strong>{analytics.issues.active}</strong>
          <small>
            {analytics.issues.active === 0
              ? "No issues need attention"
              : `${analytics.issues.critical} critical · ${analytics.issues.overdue} overdue`}
          </small>
        </div>
        <div
          className={`home-project-metric ${
            analytics.projectsRequiringAttention.total > 0
              ? "negative"
              : "positive"
          }`}
        >
          <span>Projects requiring attention</span>
          <strong>{analytics.projectsRequiringAttention.total}</strong>
          <small>
            {analytics.projectsRequiringAttention.total === 0
              ? "No active projects need attention"
              : `${analytics.projectsRequiringAttention.critical} critical · ${analytics.projectsRequiringAttention.overdue} overdue`}
          </small>
        </div>
      </div>

      <div className="home-closeout-row">
        <section
          className="home-panel home-attention-panel"
          aria-label="Immediate attention"
          title="Critical active and overdue active issue counts may overlap."
        >
          <h4>Immediate attention</h4>
          <div className="home-attention-items">
            <div>
              <span>Critical active</span>
              <strong>{analytics.issues.critical}</strong>
            </div>
            <div>
              <span>Overdue active</span>
              <strong>{analytics.issues.overdue}</strong>
            </div>
            <div>
              <span>Failed test items</span>
              <strong>{analytics.tests.failed}</strong>
            </div>
            <div>
              <span>Blocked assets</span>
              <strong>{analytics.assets.blocked}</strong>
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
          <div className="home-readiness-table-header" aria-hidden="true">
            <span>Workstream</span>
            <span>Progress</span>
            <span>Total</span>
            <span>Outstanding</span>
            <span>Ready</span>
          </div>
          <div className="home-readiness-table-body">
            {readinessRows.map((row) => (
              <button
                className="home-readiness-row"
                key={row.kind}
                type="button"
                aria-label={`View all ${row.label.toLowerCase()}`}
                onClick={() => onOpenDeliverables(row.kind)}
              >
                <strong>{row.label}</strong>
                <span className="home-readiness-progress-cell">
                  <span
                    className="home-readiness-progress"
                    role="progressbar"
                    aria-label={`${row.label} readiness`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={row.percent}
                  >
                    <span style={progressWidthStyle(row.percent)} />
                  </span>
                  <small>{row.percent}%</small>
                </span>
                <span className="total">{row.total}</span>
                <span className="remaining">{row.remaining}</span>
                <span className="complete">{row.complete}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="home-lower-dashboard">
        <div className="home-status-card-grid">
          <PieChart label="Assets" segments={assetSegments} />
          <PieChart label="Test items" segments={testSegments} />
          <PieChart label="Issues" segments={issueSegments} />
        </div>

        <section className="home-panel home-weekly-activity-panel">
          <div className="home-panel-header home-chart-panel-header">
            <h4>Workspace activity</h4>
          </div>
          <WeeklyActivityChart activity={analytics.dailyActivity} />
        </section>
        <ContinueWorkingPanel
          item={continueWorkingItem}
          currentTime={currentTime}
          onContinue={onContinueWorking}
        />
        <ProjectPerformancePanel
          projects={analytics.projectPerformance}
          onOpenProject={onOpenProject}
        />
      </div>
    </>
  );
}

export default function HomePage({
  currentOperatorName,
  continueWorkingItem,
  onContinueWorking,
  onOpenProject,
  onOpenDeliverables,
}: HomePageProps) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [analytics, setAnalytics] = useState<WorkspaceAnalytics | null>(
    null,
  );
  const [analyticsError, setAnalyticsError] = useState<string | null>(
    null,
  );
  const [refreshSequence, setRefreshSequence] = useState(0);
  const greeting = getGreetingContent(
    currentTime,
    currentOperatorName,
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      try {
        setAnalyticsError(null);
        const result = await getWorkspaceAnalytics();

        if (!cancelled) {
          setAnalytics(result);
        }
      } catch (error) {
        if (!cancelled) {
          setAnalyticsError(
            error instanceof Error
              ? error.message
              : "Failed to load workspace analytics.",
          );
        }
      }
    }

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [refreshSequence]);

  return (
    <section className="content-card section-card home-page">
      <div className="card-header home-page-header">
        <div>
          <h3>{greeting.title}</h3>
          <p>{greeting.subtitle}</p>
        </div>
      </div>

      <div className="home-scroll-container">
        <div className="section-body home-body">
          {analytics ? (
            <AnalyticsContent
              analytics={analytics}
              continueWorkingItem={continueWorkingItem}
              currentTime={currentTime}
              onContinueWorking={onContinueWorking}
              onOpenProject={onOpenProject}
              onOpenDeliverables={onOpenDeliverables}
            />
          ) : (
            <section className="home-panel home-analytics-state">
              {analyticsError ? (
                <>
                  <strong>Unable to load workspace analytics</strong>
                  <p>{analyticsError}</p>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() =>
                      setRefreshSequence((current) => current + 1)
                    }
                  >
                    Try again
                  </button>
                </>
              ) : (
                <>
                  <span className="home-analytics-loader" />
                  <strong>Preparing your workspace summary</strong>
                  <p>Reading the latest commissioning activity.</p>
                </>
              )}
            </section>
          )}

        </div>
      </div>
    </section>
  );
}
