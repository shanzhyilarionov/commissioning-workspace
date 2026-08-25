import { useEffect, useRef, useState } from "react";
import { getWorkspaceAnalytics } from "../repositories/workspaceAnalyticsRepository";
import type {
  WorkspaceAnalytics,
  WorkspaceDailyActivity,
} from "../types/workspaceAnalytics";

interface HomePageProps {
  currentOperatorName: string;
}

type DashboardTone = "positive" | "accent" | "negative" | "neutral";

interface StatusSegment {
  label: string;
  value: number;
  tone: DashboardTone;
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

function PieChart({
  label,
  segments,
}: {
  label: string;
  segments: StatusSegment[];
}) {
  const total = segments.reduce(
    (sum, segment) => sum + segment.value,
    0,
  );
  let offset = 0;

  return (
    <section className="home-panel home-pie-card">
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

function WeeklyActivityChart({
  activity,
}: {
  activity: WorkspaceDailyActivity[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(660);
  const tickCount =
    containerWidth >= 1200
      ? 9
      : containerWidth >= 850
        ? 7
        : containerWidth >= 560
          ? 5
          : 3;
  const displayedActivity = activity;
  const showDataPoints = containerWidth >= 560;
  const labelCount = Math.min(
    displayedActivity.length,
    Math.max(2, Math.floor((containerWidth - 96) / 82)),
  );
  const labelIndexes = new Set(
    Array.from({ length: labelCount }, (_, index) =>
      labelCount <= 1
        ? 0
        : Math.round(
            (index * (displayedActivity.length - 1)) /
              (labelCount - 1),
          ),
    ),
  );
  const plotPixelHeight = Math.round(
    Math.min(165, Math.max(115, containerWidth * 0.27)),
  );
  const width = 660;
  const height = 170;
  const chartLeft = 4;
  const chartRight = 38;
  const chartTop = 6;
  const chartBottom = 4;
  const chartWidth = width - chartLeft - chartRight;
  const chartHeight = height - chartTop - chartBottom;
  const maximumValue = Math.max(
    1,
    ...displayedActivity.flatMap((point) => [
      point.created,
      point.closedOut,
    ]),
  );
  const xForIndex = (index: number) =>
    chartLeft +
    (displayedActivity.length <= 1
      ? chartWidth / 2
      : (index / (displayedActivity.length - 1)) * chartWidth);
  const yForValue = (value: number) =>
    chartTop + chartHeight - (value / maximumValue) * chartHeight;
  const createdPoints = displayedActivity.map(
    (point, index) =>
      `${xForIndex(index)},${yForValue(point.created)}`,
  );
  const closedOutPoints = displayedActivity.map(
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

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });

    observer.observe(container);
    setContainerWidth(container.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

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
          style={{ height: `${plotPixelHeight}px` }}
          role="img"
          aria-label={`Daily workspace activity chart. ${displayedActivity
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
            ? displayedActivity.map((point, index) =>
                point.created > 0 || point.closedOut > 0 ? (
                  <g key={point.startDate}>
                    {point.created > 0 ? (
                      <>
                        <circle
                          className="home-chart-point-halo"
                          cx={xForIndex(index)}
                          cy={yForValue(point.created)}
                          r="0.01"
                        />
                        <circle
                          className="home-chart-point created"
                          cx={xForIndex(index)}
                          cy={yForValue(point.created)}
                          r="0.01"
                        />
                      </>
                    ) : null}
                    {point.closedOut > 0 ? (
                      <>
                        <circle
                          className="home-chart-point-halo"
                          cx={xForIndex(index)}
                          cy={yForValue(point.closedOut)}
                          r="0.01"
                        />
                        <circle
                          className="home-chart-point closed-out"
                          cx={xForIndex(index)}
                          cy={yForValue(point.closedOut)}
                          r="0.01"
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
        style={{
          gridTemplateColumns: `repeat(${displayedActivity.length}, minmax(0, 1fr))`,
        }}
        aria-hidden="true"
      >
        {displayedActivity.map((point, index) => (
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
}: {
  analytics: WorkspaceAnalytics;
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
  const readinessRows = [
    {
      label: "Required documents",
      percent: requiredDocumentPercent,
      total: analytics.deliverables.requiredDocumentsTotal,
      remaining:
        analytics.deliverables.requiredDocumentsTotal -
        analytics.deliverables.requiredDocumentsApproved,
      complete: analytics.deliverables.requiredDocumentsApproved,
    },
    {
      label: "Test records",
      percent: signedRecordPercent,
      total: analytics.deliverables.testRecordsTotal,
      remaining:
        analytics.deliverables.testRecordsTotal -
        analytics.deliverables.testRecordsSigned,
      complete: analytics.deliverables.testRecordsSigned,
    },
    {
      label: "Subsystem handover",
      percent: handoverScopePercent,
      total: analytics.deliverables.handoverSubsystemsTotal,
      remaining:
        analytics.deliverables.handoverSubsystemsTotal -
        analytics.deliverables.handoverSubsystemsComplete,
      complete: analytics.deliverables.handoverSubsystemsComplete,
    },
  ];
  const assetSegments: StatusSegment[] = [
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
  const testSegments: StatusSegment[] = [
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
  const issueSegments: StatusSegment[] = [
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

      <div className="home-analytics-grid">
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
      </div>
    </>
  );
}

export default function HomePage({
  currentOperatorName,
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
            <AnalyticsContent analytics={analytics} />
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
