import { useId } from "react";
import styles from "./UsageChart.module.css";

export interface ChartSeries {
  id: string;
  name: string;
  color: string;
  /** Values 0–100, oldest first. Null gaps are skipped. */
  values: (number | null)[];
}

export interface UsageChartProps {
  series: ChartSeries[];
  /** Labels for the x axis; sparse (empty strings) is fine. */
  xLabels: string[];
  height?: number;
  ariaLabel: string;
}

/** Convert points to a smooth cubic path (Catmull-Rom → Bézier). */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const PAD = { top: 10, right: 12, bottom: 22, left: 34 };
const WIDTH = 640;

/**
 * A restrained line chart: hairline grid, soft smooth lines, no fills,
 * no tooltips, no chart-library chrome.
 */
export function UsageChart({
  series,
  xLabels,
  height = 180,
  ariaLabel,
}: UsageChartProps) {
  const clipId = useId();
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const count = Math.max(...series.map((s) => s.values.length), xLabels.length);

  const xAt = (i: number) =>
    PAD.left + (count <= 1 ? plotW / 2 : (i / (count - 1)) * plotW);
  const yAt = (v: number) => PAD.top + (1 - v / 100) * plotH;

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD.left} y={0} width={plotW} height={height} />
        </clipPath>
      </defs>

      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line
            className={styles.grid}
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={yAt(v)}
            y2={yAt(v)}
          />
          <text className={styles.axisLabel} x={PAD.left - 8} y={yAt(v) + 3.5} textAnchor="end">
            {v}%
          </text>
        </g>
      ))}

      {xLabels.map((label, i) =>
        label ? (
          <text
            key={i}
            className={styles.axisLabel}
            x={xAt(i)}
            y={height - 6}
            textAnchor="middle"
          >
            {label}
          </text>
        ) : null,
      )}

      <g clipPath={`url(#${clipId})`}>
        {series.map((s) => {
          const points = s.values
            .map((v, i) => (v === null ? null : { x: xAt(i), y: yAt(v) }))
            .filter((p): p is { x: number; y: number } => p !== null);
          if (points.length === 0) return null;
          const last = points[points.length - 1];
          return (
            <g key={s.id}>
              <path
                className={styles.line}
                d={smoothPath(points)}
                stroke={s.color}
              />
              <circle
                cx={last.x}
                cy={last.y}
                r={3.5}
                fill={s.color}
                className={styles.endDot}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
