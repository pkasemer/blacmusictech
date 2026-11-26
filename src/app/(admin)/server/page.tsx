"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { IAlert, IRefresh } from "@/components/icons";
import { TimeChart } from "@/components/TimeChart";
import { Badge, Button, Card, Dot, Empty, ErrorBox, KV, Loading, PageHeader, Select, Table, Td, Th, cx } from "@/components/ui";
import { qs } from "@/lib/api";
import { fmtBytes, fmtDateTime, fmtNum } from "@/lib/format";
import { alertLevel, axisTop, countTop, fmtShare, fmtSpan, historyWindow, loadPercent, series, share, sortAlerts, storageParts, type Level } from "@/lib/system";
import type { ServerHistory, ServerInfo } from "@/lib/types";
import { useApi, usePoll } from "@/lib/useApi";

const RANGES = [
  { hours: 24, label: "Last 24 hours" },
  { hours: 168, label: "Last 7 days" },
  { hours: 720, label: "Last 30 days" },
];

function LevelBadge({ level }: { level: Level }) {
  return (
    <Badge tone={level === "critical" ? "red" : "amber"}>
      <IAlert size={12} className="mr-1" />
      {level === "critical" ? "Critical" : "Warning"}
    </Badge>
  );
}

/** A gauge whose colour comes from the server's own alerts; the badge says it in words too. */
function Gauge({ label, value, percent, level, children }: { label: string; value: string; percent: number; level?: Level; children: ReactNode }) {
  const tone = level === "critical" ? ["bg-danger", "bg-danger/15"] : level === "warning" ? ["bg-warning", "bg-warning/20"] : ["bg-primary", "bg-primary/15"];
  const v = Math.max(0, Math.min(100, percent));
  return (
    <section aria-label={label} className="rounded-card border border-line bg-panel p-4">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-muted">{label}</h2>
        {level && <LevelBadge level={level} />}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className={cx("mt-2 h-2 overflow-hidden rounded-full", tone[1])} role="meter" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
        <div className={cx("h-2 rounded-full", tone[0])} style={{ width: `${v}%` }} />
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-muted">{children}</div>
    </section>
  );
}

function Machine({ info }: { info: ServerInfo }) {
  const s = info.server;
  if (!s) return <Empty>The processor, memory and disk of this machine cannot be measured here.</Empty>;
  const load = loadPercent(s.load["15m"], s.cpuCount);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Gauge label="Disk" value={`${s.disk.usedPercent}% full`} percent={s.disk.usedPercent} level={alertLevel(info.alerts, "disk_low")}>
          <div>
            {fmtBytes(s.disk.usedBytes)} of {fmtBytes(s.disk.totalBytes)} used
          </div>
          <div className="font-medium text-ink">{fmtBytes(s.disk.freeBytes)} free</div>
        </Gauge>
        <Gauge label="Memory" value={`${s.memory.usedPercent}% used`} percent={s.memory.usedPercent} level={alertLevel(info.alerts, "memory_low")}>
          <div>
            {fmtBytes(s.memory.usedBytes)} of {fmtBytes(s.memory.totalBytes)} used
          </div>
          <div className="font-medium text-ink">{fmtBytes(s.memory.freeBytes)} available</div>
        </Gauge>
        <Gauge label="Processor load (15 min)" value={`${load}%`} percent={load} level={alertLevel(info.alerts, "load_high")}>
          <div>
            Load {s.load["15m"]} on {s.cpuCount} processor{s.cpuCount === 1 ? "" : "s"}
          </div>
          <div>
            1 min {s.load["1m"]} · 5 min {s.load["5m"]}
          </div>
        </Gauge>
        <Gauge label="Swap" value={s.swap.totalBytes > 0 ? `${s.swap.usedPercent}% used` : "None"} percent={s.swap.usedPercent}>
          {s.swap.totalBytes > 0 ? (
            <div>
              {fmtBytes(s.swap.usedBytes)} of {fmtBytes(s.swap.totalBytes)} used
            </div>
          ) : (
            <div>This machine has no swap space.</div>
          )}
          <div>Running for {fmtSpan(s.uptimeSeconds)}</div>
        </Gauge>
      </div>
      <p className="mt-2 text-xs text-muted">These cover the whole machine, including anything else that runs on it.</p>
    </>
  );
}

function Storage({ info }: { info: ServerInfo }) {
  const { storage } = info;
  const parts = storageParts(storage);
  const known = parts.reduce((s, p) => s + p.bytes, 0);
  // shares are of the used disk; where the disk cannot be measured, of what is known
  const whole = Math.max(known, info.server?.disk.usedBytes ?? 0);
  const summary = parts.map((p) => `${p.label} ${fmtBytes(p.bytes)} (${fmtShare(p.bytes, whole)})`).join(", ");
  return (
    <Card title="What uses the disk space">
      {storage.measuredAt === null && <p className="mb-3 text-sm text-muted">Stored files have not been counted yet. They are counted once an hour.</p>}
      <div className="flex h-7 gap-0.5 overflow-hidden rounded bg-panel" role="img" aria-label={summary}>
        {parts
          .filter((p) => p.bytes > 0)
          .map((p) => (
            <div key={p.key} title={`${p.label}: ${fmtBytes(p.bytes)}, ${fmtShare(p.bytes, whole)}`} className="h-7 min-w-0 rounded-sm hover:opacity-80" style={{ flexGrow: share(p.bytes, whole), flexBasis: 0, background: p.color }} />
          ))}
      </div>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted">
            <th scope="col" className="py-1.5 font-semibold">
              Part
            </th>
            <th scope="col" className="py-1.5 text-right font-semibold">
              Files
            </th>
            <th scope="col" className="py-1.5 text-right font-semibold">
              Size
            </th>
            <th scope="col" className="py-1.5 text-right font-semibold">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {parts.map((p) => (
            <tr key={p.key} className="border-t border-line">
              <th scope="row" className="py-1.5 font-normal">
                <span className="mr-2 inline-block size-2.5 rounded-sm align-middle" style={{ background: p.color }} aria-hidden="true" />
                {p.label}
              </th>
              <td className="py-1.5 text-right tabular-nums text-muted">{p.objects === null ? "–" : fmtNum(p.objects)}</td>
              <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">{fmtBytes(p.bytes)}</td>
              <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums text-muted">{fmtShare(p.bytes, whole)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">
        {storage.measuredAt && <>Stored files are counted once an hour, last on {fmtDateTime(storage.measuredAt)}. </>}
        {storage.otherBytes !== null && "“System and everything else” is the operating system, program images, logs and anything else on the server."}
      </p>
    </Card>
  );
}

function TopArtists({ items }: { items: ServerInfo["topArtists"] }) {
  const max = Math.max(1, ...items.map((a) => a.bytes));
  return (
    <Card title="Artists using the most space">
      {items.length === 0 ? (
        <p className="text-sm text-muted">No artist has stored audio yet.</p>
      ) : (
        <ol className="space-y-2.5">
          {items.map((a) => (
            <li key={a.artistId} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/artists/${a.artistId}`} className="min-w-0 truncate font-medium hover:text-primary">
                  {a.name}
                </Link>
                <span className="shrink-0 tabular-nums text-muted">
                  {fmtNum(a.tracks)} track{a.tracks === 1 ? "" : "s"} · <span className="text-ink">{fmtBytes(a.bytes)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded bg-sunken" aria-hidden="true">
                <div className="h-1.5 rounded bg-primary" style={{ width: `${Math.max(2, (a.bytes / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-muted">Original uploads and playback copies together.</p>
    </Card>
  );
}

function Work({ info }: { info: ServerInfo }) {
  const w = info.work;
  const failed = (n: number) => (n > 0 ? <Badge tone="red">{fmtNum(n)} failed</Badge> : "0");
  const group = (title: string, items: [string, ReactNode][]) => (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <KV items={items} />
    </div>
  );
  return (
    <Card title="Waiting work" actions={alertLevel(info.alerts, "queue_slow", "worker_silent") && <LevelBadge level={alertLevel(info.alerts, "queue_slow", "worker_silent")!} />}>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {group("Audio uploads", [
          ["Still uploading", fmtNum(w.uploads.pending)],
          ["Queued", fmtNum(w.uploads.queued)],
          ["Processing", fmtNum(w.uploads.processing)],
          ["Longest wait", w.uploads.oldestQueuedSeconds > 0 ? fmtSpan(w.uploads.oldestQueuedSeconds) : "–"],
          ["Failed, 24 h", failed(w.uploads.failedLast24h)],
        ])}
        {group("Bulk imports", [
          ["Awaiting files", fmtNum(w.imports.awaitingFiles)],
          ["Processing", fmtNum(w.imports.processing)],
        ])}
        {group("Emails", [
          ["Waiting", fmtNum(w.emails.waiting)],
          ["Failed, 24 h", failed(w.emails.failedLast24h)],
        ])}
        {group("Push notifications", [
          ["Waiting", fmtNum(w.push.waiting)],
          ["Failed, 24 h", failed(w.push.failedLast24h)],
        ])}
      </div>
    </Card>
  );
}

function History({ query, hours, onHours, serverNow, cpuCount }: { query: ReturnType<typeof useApi<ServerHistory>>; hours: number; onHours: (h: number) => void; serverNow: string; cpuCount?: number }) {
  const h = query.data;
  const win = h ? historyWindow(h.hours, h.stepSeconds, h.points, serverNow) : undefined;
  const peak = (values: number[]) => values.reduce((m, v) => Math.max(m, v), 0);
  return (
    <section aria-labelledby="history-title" className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="history-title" className="text-lg font-semibold">
          History
        </h2>
        <Select aria-label="History range" value={hours} onChange={(e) => onHours(Number(e.target.value))}>
          {RANGES.map((r) => (
            <option key={r.hours} value={r.hours}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>
      {query.error && <ErrorBox error={query.error} onRetry={query.reload} />}
      {!h && !query.error && <Loading />}
      {h && win && (
        <div className={cx(query.loading && "opacity-60")}>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Free disk space">
              <TimeChart label="Free disk space" points={series(h.points, "diskFreeBytes")} stepSeconds={h.stepSeconds} window={win} top={axisTop(peak(h.points.map((p) => p.diskFreeBytes)), true)} format={(v) => fmtBytes(v)} />
            </Card>
            <Card title="Memory used">
              <TimeChart label="Memory used" points={series(h.points, "memoryUsedPercent")} stepSeconds={h.stepSeconds} window={win} top={100} format={(v) => `${Math.round(v * 10) / 10}%`} />
            </Card>
            <Card title="Processor load">
              <TimeChart
                label="Processor load"
                points={series(h.points, "load")}
                stepSeconds={h.stepSeconds}
                window={win}
                top={axisTop(Math.max(cpuCount ?? 0, peak(h.points.map((p) => p.load))))}
                format={(v) => String(Math.round(v * 100) / 100)}
                reference={cpuCount ? { value: cpuCount, label: `${cpuCount} processor${cpuCount === 1 ? "" : "s"}` } : undefined}
              />
            </Card>
            <Card title="Uploads waiting">
              <TimeChart label="Uploads waiting" points={series(h.points, "uploadsWaiting")} stepSeconds={h.stepSeconds} window={win} top={countTop(peak(h.points.map((p) => p.uploadsWaiting)))} format={(v) => fmtNum(Math.round(v))} />
            </Card>
          </div>
          <p className="mt-3 text-xs text-muted">
            A reading is taken every 5 minutes and kept for 30 days. Each point is the worst reading in {fmtSpan(h.stepSeconds)}. A break in a line means nothing was measured then.
          </p>
          {h.points.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-primary">Show the readings as a table</summary>
              <div className="relative mt-2 max-h-96 overflow-y-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Time</Th>
                      <Th>Free disk</Th>
                      <Th>Disk used</Th>
                      <Th>Memory used</Th>
                      <Th>Load</Th>
                      <Th>Uploads waiting</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...h.points].reverse().map((p) => (
                      <tr key={p.at}>
                        <Td>{fmtDateTime(p.at)}</Td>
                        <Td className="tabular-nums">{fmtBytes(p.diskFreeBytes)}</Td>
                        <Td className="tabular-nums">{fmtBytes(p.diskUsedBytes)}</Td>
                        <Td className="tabular-nums">{p.memoryUsedPercent}%</Td>
                        <Td className="tabular-nums">{p.load}</Td>
                        <Td className="tabular-nums">{fmtNum(p.uploadsWaiting)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

export default function ServerPage() {
  const [hours, setHours] = useState(24);
  const system = useApi<ServerInfo>("/system");
  const history = useApi<ServerHistory>(`/system/history${qs({ hours })}`);
  // the current picture every minute; history changes every 5 minutes
  usePoll(true, system.reload, 60_000);
  usePoll(true, history.reload, 300_000);
  const { reload: reloadSystem } = system;
  const { reload: reloadHistory } = history;
  const refresh = useCallback(() => (reloadSystem(), reloadHistory()), [reloadSystem, reloadHistory]);
  const info = system.data;

  return (
    <>
      <PageHeader
        title="Server"
        subtitle={
          <>
            Storage and load on the machine that runs Blac Music. This page only reads: cleaning up is done with the server’s scripts.
            {info && (
              <span className="block">
                Measured {fmtDateTime(info.measuredAt)}. Last background reading: {info.lastSampleAt ? fmtDateTime(info.lastSampleAt) : "none yet"}.
              </span>
            )}
          </>
        }
        actions={
          <Button onClick={refresh} disabled={system.loading}>
            <IRefresh size={14} /> Refresh
          </Button>
        }
      />
      {system.error && (
        <div className="mb-4">
          <ErrorBox error={system.error} onRetry={refresh} />
        </div>
      )}
      {!info && !system.error && <Loading />}
      {info && (
        <>
          {info.alerts.length === 0 ? (
            <div className="mb-4">
              <Dot tone="green">The server reports no problems.</Dot>
            </div>
          ) : (
            <ul aria-label="Server alerts" className="mb-4 space-y-2">
              {sortAlerts(info.alerts).map((a) => (
                <li key={a.code} className={cx("flex items-center gap-3 rounded-control border px-3 py-2 text-sm", a.level === "critical" ? "border-danger/30 bg-danger/5" : "border-warning/40 bg-warning/5")}>
                  <LevelBadge level={a.level === "critical" ? "critical" : "warning"} />
                  <span>{a.message}</span>
                </li>
              ))}
            </ul>
          )}
          <Machine info={info} />
          <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
            <Storage info={info} />
            <TopArtists items={info.topArtists} />
          </div>
          <div className="mt-4">
            <Work info={info} />
          </div>
          <History query={history} hours={hours} onHours={setHours} serverNow={info.measuredAt} cpuCount={info.server?.cpuCount} />
        </>
      )}
    </>
  );
}
