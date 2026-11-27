"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IAlert, IRefresh } from "@/components/icons";
import { Chips, JobStatusBadge, TrackStatusBadge } from "@/components/import-parts";
import { usePageTitle } from "@/components/page-meta";
import { useToast } from "@/components/Shell";
import { Badge, Button, Card, ErrorBox, KV, Loading, PageHeader, Progress, Table, Td, Th, Tile } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { actionLabel, fmtBytes, fmtDateTime, fmtNum } from "@/lib/format";
import { orderTracks, type TrackFilter } from "@/lib/importQueue";
import { isLive, progressOf, type ImportJob } from "@/lib/imports";
import type { AuditList } from "@/lib/types";
import { useApi, usePoll } from "@/lib/useApi";

const PAGE = 25;
const TRACK_FILTERS: { value: TrackFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "processing", label: "Importing now" },
  { value: "waiting", label: "Waiting" },
  { value: "failed", label: "Failed" },
  { value: "created", label: "Added" },
  { value: "skippedDuplicate", label: "Already there" },
];

/** Who started the run and what they stated about the rights: kept in the audit log, shown here. */
function History({ jobId }: { jobId: string }) {
  const q = useApi<AuditList>(`/audit-log${qs({ targetType: "import", targetId: jobId, limit: 20 })}`);
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading rows={2} />;
  if (q.data.entries.length === 0) return <p className="text-sm text-muted">Nothing recorded for this import.</p>;
  return (
    <ul className="divide-y divide-line">
      {q.data.entries.map((e) => (
        <li key={e.id} className="py-2.5 text-sm first:pt-0">
          <div className="font-medium capitalize">{actionLabel(e.action)}</div>
          <div className="text-[11px] text-muted">
            {e.actor.email} · {fmtDateTime(e.at)}
          </div>
          {e.details && Object.keys(e.details).length > 0 && (
            <dl className="mt-1.5 space-y-0.5 text-xs">
              {Object.entries(e.details).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="shrink-0 text-muted">{k}</dt>
                  <dd className="min-w-0 break-words">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function ImportPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const q = useApi<ImportJob>(`/imports/${id}`);
  const [cancelling, setCancelling] = useState(false);
  const [filter, setFilter] = useState<TrackFilter>("all");
  const [shown, setShown] = useState(PAGE);
  const j = q.data;
  usePageTitle(j ? `Import: ${j.artist}` : undefined, "import");
  usePoll(!!j && isLive(j.status), q.reload);

  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!j) return <Loading />;

  const errors = j.errors ?? [];
  const results = j.results ?? [];
  const ordered = orderTracks(results);
  const now = ordered.filter((r) => r.status === "processing");
  const next = ordered.filter((r) => r.status === "waiting");
  const visible = filter === "all" ? ordered : ordered.filter((r) => r.status === filter);
  const countOf = (s: TrackFilter) => (s === "all" ? results.length : results.filter((r) => r.status === s).length);
  const drafts = j.visibility === "draft" || (j.type === "album" && j.failed > 0);

  return (
    <>
      <PageHeader
        title={`Import: ${j.artist}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <JobStatusBadge status={j.status} />
            <Badge>{j.type === "album" ? "Album" : "Singles"}</Badge>
            <span>{j.visibility === "public" ? "Publishes when done" : "Saved as drafts"}</span>
            {j.artistId && (
              <Link href={`/artists/${j.artistId}`} className="text-primary hover:underline">
                Open the artist
              </Link>
            )}
          </span>
        }
        actions={
          <>
            <Button onClick={q.reload} disabled={q.loading}>
              <IRefresh size={14} /> Refresh
            </Button>
            {j.status === "pending" && (
              <Button variant="danger" onClick={() => setCancelling(true)}>
                Cancel import
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 rounded-card border border-line bg-panel p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">{Math.round(progressOf(j) * 100)}% finished</span>
          {isLive(j.status) && <span className="text-xs text-muted">Refreshing every 15 seconds</span>}
        </div>
        <Progress value={progressOf(j) * 100} label="Import progress" tone={j.status === "failed" ? "red" : j.failed > 0 ? "amber" : j.status === "completed" ? "green" : "blue"} />
        {isLive(j.status) && (
          <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[7rem_1fr]">
            <dt className="text-muted">Right now</dt>
            <dd role="status" className="font-medium">
              {j.status === "pending"
                ? "Not started, so not in the queue. The script may still be sending files, or the server may have refused to start it, for example because disk space is short."
                : now.length > 0
                  ? `Importing ${now.map((r) => r.title).join(" and ")}`
                  : "Waiting its turn: earlier imports go first."}
            </dd>
            {j.status === "processing" && next.length > 0 && (
              <>
                <dt className="text-muted">Next from this import</dt>
                <dd className="min-w-0">
                  {next.slice(0, 3).map((r) => r.title).join(", ")}
                  {next.length > 3 && <span className="text-muted"> and {next.length - 3} more</span>}
                </dd>
              </>
            )}
          </dl>
        )}
        {j.status === "processing" && (
          <Link href="/imports" className="mt-2 inline-block text-xs text-primary hover:underline">
            See the whole queue
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Tracks" value={fmtNum(j.totalTracks)} />
        <Tile label="Added" value={fmtNum(j.created)} />
        <Tile label="Already there" value={fmtNum(j.skippedDuplicate)} />
        <Tile label="Failed" value={fmtNum(j.failed)} tone={j.failed > 0 ? "warn" : undefined} />
        <Tile label="Left to do" value={fmtNum(j.remaining)} sub={j.bytesStored > 0 ? `${fmtBytes(j.bytesStored)} stored` : undefined} />
      </div>

      {j.warnings && j.warnings.length > 0 && (
        <div role="status" className="mt-4 rounded-control border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-ink">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <IAlert size={15} /> Warnings
          </div>
          <ul className="list-disc pl-5">
            {j.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-4">
          <Card title={`Problems (${errors.length})`}>
            <Table>
              <thead>
                <tr>
                  <Th>Track</Th>
                  <Th>File</Th>
                  <Th>What went wrong</Th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={`${e.code}-${e.title ?? ""}-${i}`}>
                    <Td className="font-medium">{e.title || "The whole import"}</Td>
                    <Td className="text-muted">{e.file || "–"}</Td>
                    <Td>
                      {e.message} <code className="text-[11px] text-muted">{e.code}</code>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_20rem]">
        <Card title={`Tracks (${results.length})`}>
          {results.length === 0 ? (
            <p className="text-sm text-muted">No tracks to show.</p>
          ) : (
            <>
            <div className="mb-3">
              <Chips
                label="Filter tracks"
                value={filter}
                onChange={(f) => (setFilter(f), setShown(PAGE))}
                options={TRACK_FILTERS.filter((f) => f.value === "all" || f.value === filter || countOf(f.value) > 0).map((f) => ({ ...f, count: countOf(f.value) }))}
              />
            </div>
            {visible.length === 0 && <p className="text-sm text-muted">No tracks in this state now.</p>}
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Title</Th>
                  <Th>Status</Th>
                  <Th>Length</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, shown).map((r) => (
                  <tr key={r.number}>
                    <Td className="w-8 tabular-nums text-muted">{r.number}</Td>
                    <Td>
                      <div className="font-medium">{r.title}</div>
                      {r.note && <div className="text-[11px] text-muted">{r.note}</div>}
                    </Td>
                    <Td>
                      <TrackStatusBadge status={r.status} />
                    </Td>
                    <Td className="tabular-nums text-muted">{r.duration ?? "–"}</Td>
                    <Td className="text-right">
                      {r.releaseId && (
                        <Link href={`/releases/${r.releaseId}`} className="text-xs text-primary hover:underline">
                          Open release
                        </Link>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {visible.length > shown && (
              <div className="mt-3">
                <Button small onClick={() => setShown((n) => n + PAGE)}>
                  Show more ({visible.length - shown} left)
                </Button>
              </div>
            )}
            {filter === "all" && isLive(j.status) && <p className="mt-2 text-xs text-muted">Sorted: importing now, then waiting in the order they will run, then finished. The number is the place in the script&rsquo;s list.</p>}
            </>
          )}
          {drafts && j.created > 0 && <p className="mt-3 text-xs text-muted">Saved as drafts: open each release to check it and publish it.</p>}
        </Card>
        <div className="space-y-4">
          <Card title="Timing">
            <KV
              items={[
                ["Created", fmtDateTime(j.createdAt)],
                ["Started", fmtDateTime(j.startedAt)],
                ["Finished", fmtDateTime(j.finishedAt)],
                ["Import id", <code key="i" className="break-all text-xs">{j.jobId}</code>],
              ]}
            />
          </Card>
          <Card title="History and rights">
            <History jobId={j.jobId} />
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={cancelling}
        title={`Cancel the ${j.artist} import?`}
        description="It has not started, so nothing was added. The files already uploaded for it are removed. The script has to start a new import."
        confirmLabel="Cancel import"
        onClose={() => setCancelling(false)}
        onConfirm={async () => {
          await api(`/imports/${j.jobId}`, { method: "DELETE" });
          toast("Import cancelled");
          q.reload();
        }}
      />
    </>
  );
}
