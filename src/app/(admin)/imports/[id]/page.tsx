"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IAlert, IRefresh } from "@/components/icons";
import { JobStatusBadge, TrackStatusBadge } from "@/components/import-parts";
import { usePageTitle } from "@/components/page-meta";
import { useToast } from "@/components/Shell";
import { Badge, Button, Card, ErrorBox, KV, Loading, PageHeader, Progress, Table, Td, Th, Tile } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { actionLabel, fmtBytes, fmtDateTime, fmtNum } from "@/lib/format";
import { isLive, progressOf, type ImportJob } from "@/lib/imports";
import type { AuditList } from "@/lib/types";
import { useApi, usePoll } from "@/lib/useApi";

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
  const j = q.data;
  usePageTitle(j ? `Import: ${j.artist}` : undefined, "import");
  usePoll(!!j && isLive(j.status), q.reload);

  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!j) return <Loading />;

  const errors = j.errors ?? [];
  const results = j.results ?? [];
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
          {isLive(j.status) && <span className="text-xs text-muted">{j.status === "pending" ? "Waiting for the script to upload the files" : "Refreshing every 15 seconds"}</span>}
        </div>
        <Progress value={progressOf(j) * 100} label="Import progress" tone={j.status === "failed" ? "red" : j.failed > 0 ? "amber" : j.status === "completed" ? "green" : "blue"} />
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
                {results.map((r, i) => (
                  <tr key={`${r.title}-${i}`}>
                    <Td className="w-8 tabular-nums text-muted">{i + 1}</Td>
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
