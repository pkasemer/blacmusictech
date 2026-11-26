"use client";

import { useId, useState } from "react";
import { splitAtGaps, type TimedValue } from "@/lib/system";

const W = 640;
const H = 180;
const PAD = { l: 62, r: 12, t: 14, b: 26 };
const COLOR = "#2a78d6";

/**
 * One measure over real time: points sit where they were measured, and the line breaks where nothing was measured.
 * Hover, or focus and use the arrow keys, to read a single point.
 */
export function TimeChart({
  points,
  stepSeconds,
  window: win,
  top,
  label,
  format,
  reference,
}: {
  points: TimedValue[];
  stepSeconds: number;
  window: { start: number; end: number };
  /** top of the y axis */
  top: number;
  label: string;
  format: (v: number) => string;
  reference?: { value: number; label: string };
}) {
  const id = useId();
  const [picked, setPicked] = useState<number | null>(null);
  if (points.length === 0) return <div className="py-10 text-center text-sm text-muted">No readings in this time range yet.</div>;
  const span = Math.max(1, win.end - win.start);
  const x = (t: number) => PAD.l + Math.max(0, Math.min(1, (t - win.start) / span)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - Math.max(0, Math.min(1, v / top))) * (H - PAD.t - PAD.b);
  const base = H - PAD.b;
  const runs = splitAtGaps(points, stepSeconds);
  const active = picked !== null && picked < points.length ? points[picked] : undefined;
  const latest = points[points.length - 1]!;
  const short = span <= 48 * 3_600_000;
  const axisTime = (t: number) =>
    short ? new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const readTime = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const pickNearest = (px: number) => {
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i]!.t) - px) < Math.abs(x(points[best]!.t) - px)) best = i;
    setPicked(best);
  };

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${id}-t`}
        tabIndex={0}
        className="h-auto w-full rounded-control"
        onMouseLeave={() => setPicked(null)}
        onBlur={() => setPicked(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          pickNearest(((e.clientX - r.left) / r.width) * W);
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const from = picked ?? points.length - 1;
          setPicked(Math.max(0, Math.min(points.length - 1, from + (e.key === "ArrowLeft" ? -1 : 1))));
        }}
      >
        <title id={`${id}-t`}>{`${label}: latest ${format(latest.v)}, ${points.length} readings`}</title>
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e5e5e9" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="13" fill="#777780">
              {format(v)}
            </text>
          </g>
        ))}
        {reference && reference.value <= top && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(reference.value)} y2={y(reference.value)} stroke="#9999a1" strokeWidth="1" />
            <text x={PAD.l + 4} y={y(reference.value) - 4} fontSize="12" fill="#777780">
              {reference.label}
            </text>
          </g>
        )}
        {runs.map((run) =>
          run.length === 1 ? (
            <circle key={run[0]!.t} cx={x(run[0]!.t)} cy={y(run[0]!.v)} r="4" fill={COLOR} stroke="#ffffff" strokeWidth="2" />
          ) : (
            <g key={run[0]!.t}>
              <path d={`${run.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")} L${x(run[run.length - 1]!.t).toFixed(1)},${base} L${x(run[0]!.t).toFixed(1)},${base} Z`} fill={COLOR} opacity="0.1" />
              <path d={run.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")} fill="none" stroke={COLOR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ),
        )}
        {[win.start, win.start + span / 2, win.end].map((t, i) => (
          <text key={i} x={x(t)} y={H - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fontSize="13" fill="#777780">
            {axisTime(t)}
          </text>
        ))}
        {active && (
          <g>
            <line x1={x(active.t)} x2={x(active.t)} y1={PAD.t} y2={base} stroke="#9999a1" strokeWidth="1" />
            <circle cx={x(active.t)} cy={y(active.v)} r="4.5" fill={COLOR} stroke="#ffffff" strokeWidth="2" />
          </g>
        )}
      </svg>
      <figcaption className="mt-1 text-right text-xs text-muted" aria-live="polite">
        {active ? `${readTime(active.t)}: ${format(active.v)}` : `Latest ${format(latest.v)}`}
      </figcaption>
    </figure>
  );
}
