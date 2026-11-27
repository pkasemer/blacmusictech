"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IAlert, IRefresh } from "@/components/icons";
import { useToast } from "@/components/Shell";
import { Button, Dot, Empty, ErrorBox, Loading, PageHeader, Table, Td, Th, Tile, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fmtBytes, fmtDateTime, fmtNum } from "@/lib/format";
import { SECTIONS, describe, noRetryReason, retryError, type ProcessingList, type ProcessingUpload } from "@/lib/processing";
import { useApi, usePoll } from "@/lib/useApi";

export default function ProcessingPage() {
  const q = useApi<ProcessingList>("/processing");
  const toast = useToast();
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [forcing, setForcing] = useState<ProcessingUpload | null>(null);
  // an older server has no such list: say so, instead of showing an error or an empty (all is well) page
  const unavailable = q.error?.code === "not_available" || q.error?.status === 404;
  usePoll(!unavailable, q.reload, 10_000);
  const data = q.data;

  async function retry(u: ProcessingUpload, force: boolean) {
    setBusy((old) => new Set(old).add(u.uploadId));
    try {
      await api(`/processing/${u.uploadId}/retry`, { method: "POST", body: force ? { force: true } : {} });
      toast(`"${u.title}" is back in the queue`);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      toast(err ? retryError(err.code, err.message) : "Could not retry the song.", "error");
    } finally {
      setBusy((old) => {
        const next = new Set(old);
        next.delete(u.uploadId);
        return next;
      });
      q.reload(); // a refusal means the state changed, so look again either way
    }
  }

  const action = (u: ProcessingUpload) => {
    const working = busy.has(u.uploadId);
    if (u.canRetry)
      return (
        <Button small variant="primary" disabled={working} onClick={() => void retry(u, false)} aria-label={`Retry ${u.title}`}>
          {working ? "Retrying…" : "Retry"}
        </Button>
      );
    if (u.canForce)
      return (
        <Button small disabled={working} onClick={() => setForcing(u)} aria-label={`Restart ${u.title} anyway`}>
          {working ? "Restarting…" : "Restart anyway"}
        </Button>
      );
    return u.state === "failed" ? <span className="text-xs text-muted">{noRetryReason}</span> : null;
  };

  return (
    <>
      <PageHeader
        title="Song processing"
        subtitle="Uploaded songs on their way to being playable. If one gets stuck, retry it here."
        actions={
          !unavailable && (
            <Button onClick={q.reload} disabled={q.loading}>
              <IRefresh size={14} /> Refresh
            </Button>
          )
        }
      />
      {unavailable && <Empty>This list is not available on the server yet. It appears here once the server has been updated.</Empty>}
      {q.error && !unavailable && (
        <div className="mb-4">
          <ErrorBox error={q.error} onRetry={q.reload} />
        </div>
      )}
      {!data && !q.error && <Loading />}
      {data && !unavailable && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Stuck" value={fmtNum(data.counts.stuck)} tone={data.counts.stuck > 0 ? "warn" : undefined} icon={data.counts.stuck > 0 ? <IAlert size={15} /> : undefined} />
            <Tile label="Being worked on" value={fmtNum(data.counts.working)} />
            <Tile label="Waiting" value={fmtNum(data.counts.waiting)} />
            <Tile label="Failed, last 7 days" value={fmtNum(data.counts.failed)} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Refreshes every 10 seconds. Last server reading from the worker: {data.workerLastSeenAt ? fmtDateTime(data.workerLastSeenAt) : "none yet"} (taken every 5 minutes).
          </p>
          {data.counts.stuck === 0 && (
            <div className="mt-3">
              <Dot tone="green">No song is stuck.</Dot>
            </div>
          )}
          {data.uploads.length === 0 && (
            <div className="mt-4">
              <Empty>Nothing is being processed or waiting, and nothing failed in the last 7 days.</Empty>
            </div>
          )}
          {SECTIONS.map((s) => {
            const rows = data.uploads.filter((u) => u.state === s.state);
            if (rows.length === 0) return null;
            const total = data.counts[s.state];
            return (
              <section key={s.state} aria-label={s.title} className="mt-6">
                <h2 className={cx("text-lg font-semibold", s.state === "stuck" && "text-warning-ink")}>
                  {s.title} ({fmtNum(total)})
                </h2>
                <p className="mb-2 text-xs text-muted">
                  {s.hint}
                  {total > rows.length && ` Showing ${fmtNum(rows.length)} of ${fmtNum(total)}.`}
                </p>
                <Table>
                  <thead>
                    <tr>
                      <Th>Song</Th>
                      <Th>How it stands</Th>
                      <Th>Tries</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => (
                      <tr key={u.uploadId} className="hover:bg-sunken/50">
                        <Td>
                          <div className="font-medium">{u.title}</div>
                          <div className="text-xs text-muted">
                            <Link href={`/artists/${u.artistId}`} className="hover:text-primary">
                              {u.artistName}
                            </Link>
                            {" · "}
                            {u.releaseId ? (
                              <Link href={`/releases/${u.releaseId}`} className="hover:text-primary">
                                {u.releaseTitle}
                              </Link>
                            ) : (
                              "release deleted"
                            )}
                            {u.import && (
                              <>
                                {" · "}
                                <Link href={`/imports/${u.import.jobId}`} className="hover:text-primary">
                                  from a bulk import
                                </Link>
                              </>
                            )}
                            {" · "}
                            {fmtBytes(u.sizeBytes)}
                          </div>
                        </Td>
                        <Td className={cx("text-sm", s.state === "failed" && "text-danger-ink")}>{describe(u, data.measuredAt)}</Td>
                        <Td className="tabular-nums text-muted">{u.attempts}</Td>
                        <Td className="text-right">{action(u)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </section>
            );
          })}
        </>
      )}
      <ConfirmDialog
        open={!!forcing}
        title={`Restart "${forcing?.title ?? ""}" anyway?`}
        description="The server says it is still being worked on. Restarting throws that attempt away and starts again from the beginning. Do this only if it has clearly been going far too long."
        confirmLabel="Restart anyway"
        onClose={() => setForcing(null)}
        onConfirm={async () => {
          if (forcing) await retry(forcing, true);
        }}
      />
    </>
  );
}
