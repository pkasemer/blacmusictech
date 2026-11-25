"use client";

import { useId, useState } from "react";

export interface Point {
  date: string;
  count: number;
}

/** A small accessible SVG line/area chart with a hover read-out. */
export function LineChart({ points, label, color = "#6d28d9" }: { points: Point[]; label: string; color?: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const pad = { l: 52, r: 10, t: 12, b: 28 };
  if (points.length === 0) return <div className="py-10 text-center text-sm text-muted">No data for this range.</div>;
  const max = Math.max(1, ...points.map((p) => p.count));
  const top = niceMax(max);
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;
  const total = points.reduce((s, p) => s + p.count, 0);
  const ticks = [0, top / 2, top];
  const labelIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const h = hover !== null ? points[hover] : undefined;
  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${id}-t`}
        className="h-auto w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (points.length - 1));
          setHover(Math.min(points.length - 1, Math.max(0, i)));
        }}
      >
        <title id={`${id}-t`}>{`${label}: ${total.toLocaleString()} in total over ${points.length} points`}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e3e6ec" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="14" fill="#5d6572">
              {Math.round(t).toLocaleString()}
            </text>
          </g>
        ))}
        <path d={area} fill={color} opacity="0.12" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="14" fill="#5d6572">
            {points[i]!.date.slice(5)}
          </text>
        ))}
        {hover !== null && h && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#9ca3af" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.count)} r="4" fill={color} />
          </g>
        )}
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span aria-live="polite">{h ? `${h.date}: ${h.count.toLocaleString()}` : `Total ${total.toLocaleString()}`}</span>
      </figcaption>
    </figure>
  );
}

function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * p;
}

/** Horizontal bars for a short ranked list. */
export function BarList({ items, empty = "Nothing yet." }: { items: { id: string; name: string; value: number }[]; empty?: string }) {
  if (items.length === 0) return <div className="py-6 text-center text-sm text-muted">{empty}</div>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ol className="space-y-2">
      {items.map((it) => (
        <li key={it.id} className="text-sm">
          <div className="flex justify-between gap-3">
            <span className="truncate">{it.name}</span>
            <span className="tabular-nums text-muted">{it.value.toLocaleString()}</span>
          </div>
          <div className="mt-1 h-1.5 rounded bg-canvas" aria-hidden="true">
            <div className="h-1.5 rounded bg-brand" style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
