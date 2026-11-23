import { pieChartGeometry } from "../styles/layout/chartGeometry";

export interface PieChartSegment {
  label: string;
  value: number;
  tone: "positive" | "accent" | "negative" | "neutral" | "warning" | "info";
}

function PieChart({
  label,
  segments,
  className = "",
}: {
  label: string;
  segments: PieChartSegment[];
  className?: string;
}) {
  const total = segments.reduce(
    (sum, segment) => sum + segment.value,
    0,
  );
  let offset = 0;

  return (
    <section
      className={["home-panel", "home-pie-card", className]
        .filter(Boolean)
        .join(" ")}
    >
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
            viewBox={pieChartGeometry.viewBox}
            aria-hidden="true"
          >
            <circle
              className="home-pie-track"
              {...pieChartGeometry.circle}
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
                  {...pieChartGeometry.circle}
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

export default PieChart;
