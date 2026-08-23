import { useEffect, useState } from "react";
import { getWorkspaceAnalytics } from "../repositories/workspaceAnalyticsRepository";
import type {
  WorkspaceAnalytics,
  WorkspaceWeeklyActivity,
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
  activity: WorkspaceWeeklyActivity[];
}) {
  const width = 660;
  const height = 170;
  const chartLeft = 4;
  const chartRight = 4;
  const chartTop = 6;
  const chartBottom = 4;
  const chartWidth = width - chartLeft - chartRight;
  const chartHeight = height - chartTop - chartBottom;
  const maximumValue = Math.max(
    1,
    ...activity.flatMap((week) => [week.created, week.closedOut]),
  );
  const xForIndex = (index: number) =>
    chartLeft +
    (activity.length <= 1
      ? chartWidth / 2
      : (index / (activity.length - 1)) * chartWidth);
  const yForValue = (value: number) =>
    chartTop + chartHeight - (value / maximumValue) * chartHeight;
  const createdPoints = activity.map(
    (week, index) =>
      `${xForIndex(index)},${yForValue(week.created)}`,
  );
  const closedOutPoints = activity.map(
    (week, index) =>
      `${xForIndex(index)},${yForValue(week.closedOut)}`,
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
  const tickValues = [maximumValue, Math.ceil(maximumValue / 2), 0];

  return (
    <div className="home-weekly-chart">
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
            <span key={`${tickValue}-${index}`}>{tickValue}</span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Eight-week activity chart. ${activity
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

          {activity.map((week, index) => (
            <g key={week.startDate}>
              <circle
                className="home-chart-point created"
                cx={xForIndex(index)}
                cy={yForValue(week.created)}
                r="3"
              />
              <circle
                className="home-chart-point closed-out"
                cx={xForIndex(index)}
                cy={yForValue(week.closedOut)}
                r="3"
              />
            </g>
          ))}
        </svg>
      </div>
      <div
        className="home-chart-x-labels"
        style={{
          gridTemplateColumns: `repeat(${activity.length}, minmax(0, 1fr))`,
        }}
        aria-hidden="true"
      >
        {activity.map((week) => (
          <span key={week.startDate}>{week.label}</span>
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
  return (
    <>
      <div
        className="home-project-metrics"
        aria-label="Workspace commissioning summary"
      >
        <div className="home-project-metric accent">
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
        <div className="home-project-metric accent">
          <span>Test pass rate</span>
          <strong>
            {analytics.tests.assessed === 0
              ? "-"
              : `${analytics.tests.passRate}%`}
          </strong>
          <small>
            {analytics.tests.assessed === 0
              ? "No assessed test items"
              : `${analytics.tests.failed} failed of ${analytics.tests.assessed} assessed`}
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
        <div className="home-project-metric positive">
          <span>Closed out in 7 days</span>
          <strong>{analytics.recentActivity.closedOut}</strong>
          <small>
            {analytics.recentActivity.created} created ·{" "}
            {analytics.recentActivity.updated} updated
          </small>
        </div>
      </div>

      <div className="home-analytics-grid">
        <div className="home-status-card-grid">
          <PieChart label="Assets" segments={assetSegments} />
          <PieChart label="Test items" segments={testSegments} />
        </div>

        <section className="home-panel home-weekly-activity-panel">
          <div className="home-panel-header home-chart-panel-header">
            <h4>Weekly activity</h4>
          </div>
          <WeeklyActivityChart activity={analytics.weeklyActivity} />
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
