// Display rules for the Server page (GET /system and /system/history). Pure, so they are testable.
// The server decides what is a problem (its `alerts`); the page does not keep thresholds of its own.

import type { ServerHistoryPoint, ServerInfo } from "./types";

export type Level = "warning" | "critical";

/** The worst alert level among these codes, or undefined when the server raised none of them. */
export function alertLevel(alerts: ServerInfo["alerts"], ...codes: string[]): Level | undefined {
  const mine = alerts.filter((a) => codes.includes(a.code));
  if (mine.length === 0) return undefined;
  return mine.some((a) => a.level === "critical") ? "critical" : "warning";
}

/** Critical alerts first; otherwise the server's order. */
export function sortAlerts(alerts: ServerInfo["alerts"]): ServerInfo["alerts"] {
  return [...alerts].sort((a, b) => Number(b.level === "critical") - Number(a.level === "critical"));
}

export interface StoragePart {
  key: string;
  label: string;
  bytes: number;
  /** null where a count of files means nothing */
  objects: number | null;
  color: string;
}

// categorical slots in their fixed order (validated on white); the "everything else" remainder is neutral grey
const COLORS = { audioOriginals: "#2a78d6", audioPlayback: "#eb6834", images: "#1baf7a", database: "#eda100", other: "#e87ba4", rest: "#b8b8c0" };

/** What the used disk space is made of. Parts that are not known yet are left out, never shown as zero. */
export function storageParts(storage: ServerInfo["storage"]): StoragePart[] {
  const out: StoragePart[] = [];
  const kind = (key: "audioOriginals" | "audioPlayback" | "images", label: string) => {
    const k = storage.byKind?.[key];
    if (k) out.push({ key, label, bytes: k.bytes, objects: k.objects, color: COLORS[key] });
  };
  kind("audioOriginals", "Original audio uploads");
  kind("audioPlayback", "Audio made for playback");
  kind("images", "Pictures and covers");
  out.push({ key: "database", label: "Database", bytes: storage.databaseBytes, objects: null, color: COLORS.database });
  if (storage.byKind) out.push({ key: "other", label: "Other stored files", bytes: storage.byKind.other.bytes, objects: storage.byKind.other.objects, color: COLORS.other });
  if (storage.otherBytes !== null) out.push({ key: "rest", label: "System and everything else", bytes: storage.otherBytes, objects: null, color: COLORS.rest });
  return out;
}

export function share(part: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(1, part / total)) : 0;
}

export function fmtShare(part: number, total: number): string {
  const pct = share(part, total) * 100;
  if (part > 0 && pct < 0.1) return "under 0.1%";
  return `${pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10}%`;
}

export function fmtSpan(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} days ${h % 24} h` : `${d} days`;
}

/** The 15-minute load as a share of what the processors can run at once (can exceed 100). */
export function loadPercent(load15: number, cpuCount: number): number {
  return cpuCount > 0 ? Math.round((load15 / cpuCount) * 100) : 0;
}

export interface TimedValue {
  t: number;
  v: number;
}

export function series(points: ServerHistoryPoint[], key: "load" | "memoryUsedPercent" | "diskFreeBytes" | "uploadsWaiting"): TimedValue[] {
  return points.map((p) => ({ t: Date.parse(p.at), v: p[key] }));
}

/**
 * Cuts a series where readings are missing (the worker was down), so a chart never draws a line across time nobody measured.
 * One skipped step is tolerated: a 5-minute reading can drift past a step boundary.
 */
export function splitAtGaps(points: TimedValue[], stepSeconds: number): TimedValue[][] {
  const out: TimedValue[][] = [];
  const limit = stepSeconds * 2500;
  for (const p of points) {
    const run = out[out.length - 1];
    const last = run?.[run.length - 1];
    if (run && last && p.t - last.t <= limit) run.push(p);
    else out.push([p]);
  }
  return out;
}

/** The time window a history answer covers: it ends at the server's clock (or the newest reading, if later). */
export function historyWindow(hours: number, stepSeconds: number, points: ServerHistoryPoint[], serverNow: string): { start: number; end: number } {
  const last = points.length ? Date.parse(points[points.length - 1]!.at) : 0;
  const end = Math.max(Date.parse(serverNow) || 0, last + stepSeconds * 1000);
  return { start: end - hours * 3_600_000, end };
}

/** The axis top for whole-number counts: even, so the middle gridline is a whole number too. */
export function countTop(v: number): number {
  const top = axisTop(Math.max(2, v));
  return top % 2 === 0 ? top : top + 1;
}

/** A round number at or above v for the top of an axis. With binary=true it is round in KB/MB/GB. */
export function axisTop(v: number, binary = false): number {
  if (v <= 0) return 1;
  const unit = binary ? 1024 ** Math.max(0, Math.floor(Math.log(v) / Math.log(1024))) : 1;
  const n = v / unit;
  const p = 10 ** Math.floor(Math.log10(n));
  const m = n / p;
  const top = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 8 ? 8 : 10) * p;
  return top * unit;
}
