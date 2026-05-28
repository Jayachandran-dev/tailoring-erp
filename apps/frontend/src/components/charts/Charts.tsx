// Hand-rolled SVG charts. No runtime dependencies.
// All charts are responsive via viewBox and "width: 100%" of the wrapping element.

import { useId } from 'react';

// ------------------------------------------------------------------
// DonutChart — slices with hover tooltips and an optional center label.
// ------------------------------------------------------------------
export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  data: DonutSlice[];
  size?: number;        // viewBox size in px (square)
  thickness?: number;   // ring thickness
  centerLabel?: string;
  centerSub?: string;
}

export function DonutChart({
  data,
  size = 220,
  thickness = 34,
  centerLabel,
  centerSub,
}: DonutProps) {
  const id = useId();
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = size / 2;
  const inner = radius - thickness;
  const cx = radius;
  const cy = radius;

  if (total <= 0) {
    return (
      <div className="chart-empty">
        <svg viewBox={`0 0 ${size} ${size}`} className="chart-svg">
          <circle cx={cx} cy={cy} r={radius - thickness / 2} fill="none" stroke="#e2e8f0" strokeWidth={thickness} />
        </svg>
        <div className="chart-empty-text">No data yet</div>
      </div>
    );
  }

  let acc = 0;
  const slices = data
    .filter((d) => d.value > 0)
    .map((d, i) => {
      const startAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
      acc += d.value;
      const endAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
      const large = endAngle - startAngle > Math.PI ? 1 : 0;
      const x1 = cx + radius * Math.cos(startAngle);
      const y1 = cy + radius * Math.sin(startAngle);
      const x2 = cx + radius * Math.cos(endAngle);
      const y2 = cy + radius * Math.sin(endAngle);
      const xi2 = cx + inner * Math.cos(endAngle);
      const yi2 = cy + inner * Math.sin(endAngle);
      const xi1 = cx + inner * Math.cos(startAngle);
      const yi1 = cy + inner * Math.sin(startAngle);
      const path = [
        `M ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`,
        `L ${xi2} ${yi2}`,
        `A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1}`,
        'Z',
      ].join(' ');
      const pct = ((d.value / total) * 100).toFixed(1);
      return (
        <path
          key={`${id}-${i}`}
          d={path}
          fill={d.color}
          className="donut-slice"
        >
          <title>
            {d.label}: {d.value} ({pct}%)
          </title>
        </path>
      );
    });

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="chart-svg donut">
        {slices}
        {(centerLabel || centerSub) && (
          <g className="donut-center">
            {centerLabel && (
              <text x={cx} y={cy - 2} textAnchor="middle" className="donut-center-value">
                {centerLabel}
              </text>
            )}
            {centerSub && (
              <text x={cx} y={cy + 16} textAnchor="middle" className="donut-center-sub">
                {centerSub}
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------
// ChartLegend — shared chip-style legend for donut / bar charts.
// ------------------------------------------------------------------
export function ChartLegend({
  items,
  format,
}: {
  items: { label: string; value: number; color: string }[];
  format?: (v: number) => string;
}) {
  const fmt = format ?? ((v: number) => String(v));
  return (
    <ul className="chart-legend">
      {items.map((it) => (
        <li key={it.label}>
          <span className="legend-dot" style={{ background: it.color }} />
          <span className="legend-label">{it.label}</span>
          <span className="legend-value">{fmt(it.value)}</span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------
// BarChart — vertical bars, optional value labels, y-axis hidden by default.
// X labels rotate-free; pass short ones.
// ------------------------------------------------------------------
export interface BarDatum {
  label: string;
  value: number;
  /** Optional override tooltip — defaults to label + value. */
  tooltip?: string;
  /** Optional override colour. */
  color?: string;
}

interface BarProps {
  data: BarDatum[];
  height?: number;
  color?: string;
  format?: (v: number) => string;
  /** Highlight indexes (e.g. last day). */
  highlightIndex?: number;
}

export function BarChart({
  data,
  height = 200,
  color = 'var(--primary)',
  format,
  highlightIndex,
}: BarProps) {
  if (data.length === 0) {
    return <div className="chart-empty"><div className="chart-empty-text">No data yet</div></div>;
  }
  const fmt = format ?? ((v: number) => String(v));
  const max = Math.max(1, ...data.map((d) => d.value));
  const padTop = 16;     // headroom for value labels
  const padBottom = 22;  // x-axis labels
  const padX = 4;
  const innerHeight = height - padTop - padBottom;
  const colW = 100 / data.length;
  const barW = Math.max(2, colW - 4);

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="chart-svg bar"
        style={{ height }}
      >
        {/* baseline */}
        <line
          x1={0}
          x2={100}
          y1={padTop + innerHeight}
          y2={padTop + innerHeight}
          stroke="var(--border)"
          strokeWidth={0.5}
        />
        {data.map((d, i) => {
          const h = (d.value / max) * innerHeight;
          const x = i * colW + (colW - barW) / 2 + padX / 2;
          const y = padTop + innerHeight - h;
          const isHi = highlightIndex === i;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW - padX}
                height={Math.max(0.5, h)}
                rx={1}
                ry={1}
                fill={d.color ?? color}
                opacity={isHi ? 1 : 0.85}
                className="bar-rect"
              >
                <title>{d.tooltip ?? `${d.label}: ${fmt(d.value)}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="bar-xlabels">
        {data.map((d, i) => (
          <span key={i} className={highlightIndex === i ? 'hi' : undefined}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
