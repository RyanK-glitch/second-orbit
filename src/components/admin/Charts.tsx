/**
 * Dependency-free, server-rendered SVG charts for the back office.
 * Single-series, one accent hue; each mark carries a <title> tooltip and every chart
 * has a table view, so nothing depends on colour or hover alone.
 */

type Point = { label: string; value: number; display: string };

const W = 480;
const H = 180;
const PAD = { top: 14, right: 6, bottom: 24, left: 46 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

export function ColumnChart({ title, points, format }: { title: string; points: Point[]; format: (n: number) => string }) {
  const top = Math.max(...points.map((p) => p.value), 0);
  if (top === 0) return <p className="chart-empty">Nothing in this period.</p>;
  const max = niceMax(top);
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const band = iw / points.length;
  const bw = Math.min(24, Math.max(band - 2, 2));
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a), points[0]);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. Peak ${peak?.display} on ${peak?.label}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-gridline" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="chart-axis" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = PAD.left + i * band + (band - bw) / 2;
          const h = Math.max(ih - (y(p.value) - PAD.top), p.value > 0 ? 2 : 0);
          const r = Math.min(4, h / 2, bw / 2);
          // Rounded data-end, square at the baseline.
          const y0 = PAD.top + ih - h;
          const d = h > 0 ? `M${x},${PAD.top + ih}V${y0 + r}Q${x},${y0} ${x + r},${y0}H${x + bw - r}Q${x + bw},${y0} ${x + bw},${y0 + r}V${PAD.top + ih}Z` : "";
          return (
            <g key={p.label} className="chart-hit">
              <rect x={PAD.left + i * band} y={PAD.top} width={band} height={ih} fill="transparent" />
              {d && <path className="chart-bar" d={d} />}
              <title>{`${p.label}: ${p.display}`}</title>
            </g>
          );
        })}
        {[0, Math.floor(points.length / 2), points.length - 1].map((i) => points[i] && (
          <text key={i} className="chart-axis" x={PAD.left + i * band + band / 2} y={H - 6} textAnchor="middle">{points[i].label}</text>
        ))}
      </svg>
      <ChartTable title={title} points={points} />
    </figure>
  );
}

/** Horizontal bars for ranked categories (magnitude, one hue), value at the tip. */
export function BarList({ title, points }: { title: string; points: Point[] }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <figure className="chart">
      <ul className="barlist" aria-label={title}>
        {points.map((p) => (
          <li key={p.label} title={`${p.label}: ${p.display}`}>
            <span className="barlist-label">{p.label}</span>
            <span className="barlist-track"><span className="barlist-bar" style={{ width: `${(p.value / max) * 100}%` }} /></span>
            <span className="barlist-value">{p.display}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function ChartTable({ title, points }: { title: string; points: Point[] }) {
  return (
    <details className="chart-table">
      <summary>Show data table</summary>
      <div className="table-wrap">
        <table className="table">
          <caption className="visually-hidden">{title}</caption>
          <thead><tr><th scope="col">Day</th><th scope="col">Value</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.label}><td>{p.label}</td><td>{p.display}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat glass">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {sub && <span className="hint">{sub}</span>}
    </div>
  );
}
