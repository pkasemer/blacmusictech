"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IImport, IKey, IRefresh } from "@/components/icons";
import { JobStatusBadge } from "@/components/import-parts";
import { useToast } from "@/components/Shell";
import { Button, Empty, ErrorBox, Loading, PageHeader, Progress, Table, Td, Th } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtBytes, fmtDateTime } from "@/lib/format";
import { isLive, progressOf, type ImportJob, type ImportList } from "@/lib/imports";
import { useApi, usePoll } from "@/lib/useApi";

export default function ImportsPage() {
  const q = useApi<ImportList>("/imports");
  const toast = useToast();
  const [cancelling, setCancelling] = useState<ImportJob | null>(null);
  const jobs = q.data?.imports ?? [];
  const live = jobs.some((j) => isLive(j.status));
  usePoll(live, q.reload);

  return (
    <>
      <PageHeader
        title="Imports"
        subtitle="Bulk import runs, newest first (the latest 20). A script with an API key starts them."
        actions={
          <>
            <Link href="/api-keys">
              <Button>
                <IKey size={14} /> API keys
              </Button>
            </Link>
            <Button onClick={q.reload} disabled={q.loading}>
              <IRefresh size={14} /> Refresh
            </Button>
          </>
        }
      />
      {live && <p className="mb-2 text-xs text-muted">Refreshing every 15 seconds while an import is unfinished. About 42 seconds per song on the live server.</p>}
      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}
      {!q.data && !q.error && <Loading />}
      {q.data && jobs.length === 0 && <Empty icon={<IImport size={20} />}>No imports yet.</Empty>}
      {jobs.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Artist</Th>
              <Th>Status</Th>
              <Th className="w-40">Progress</Th>
              <Th>Result</Th>
              <Th>Started</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.jobId} className="hover:bg-sunken/50">
                <Td>
                  <Link href={`/imports/${j.jobId}`} className="font-medium hover:text-primary">
                    {j.artist}
                  </Link>
                  <div className="text-[11px] text-muted">
                    {j.totalTracks} {j.type === "album" ? "track album" : `single${j.totalTracks === 1 ? "" : "s"}`} · {j.visibility === "public" ? "publishes" : "drafts"}
                  </div>
                </Td>
                <Td>
                  <JobStatusBadge status={j.status} />
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Progress value={progressOf(j) * 100} label={`Progress of the ${j.artist} import`} tone={j.status === "failed" ? "red" : j.failed > 0 ? "amber" : j.status === "completed" ? "green" : "blue"} />
                    </div>
                    <span className="w-9 text-right text-[11px] tabular-nums text-muted">{Math.round(progressOf(j) * 100)}%</span>
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  <div className="text-success-ink">{j.created} added</div>
                  {j.skippedDuplicate > 0 && <div className="text-muted">{j.skippedDuplicate} already there</div>}
                  {j.failed > 0 && <div className="text-danger-ink">{j.failed} failed</div>}
                  {j.remaining > 0 && j.status !== "cancelled" && <div className="text-muted">{j.remaining} to go</div>}
                  {j.bytesStored > 0 && <div className="text-[11px] text-muted">{fmtBytes(j.bytesStored)} stored</div>}
                </Td>
                <Td className="whitespace-nowrap text-muted">{fmtDateTime(j.startedAt ?? j.createdAt)}</Td>
                <Td className="text-right">
                  {j.status === "pending" && (
                    <Button small variant="ghost" className="text-danger-ink hover:bg-danger/10 hover:text-danger-ink" onClick={() => setCancelling(j)}>
                      Cancel
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <ConfirmDialog
        open={!!cancelling}
        title={`Cancel the ${cancelling?.artist ?? ""} import?`}
        description="It has not started, so nothing was added. The files already uploaded for it are removed. The script has to start a new import."
        confirmLabel="Cancel import"
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          if (!cancelling) return;
          await api(`/imports/${cancelling.jobId}`, { method: "DELETE" });
          toast("Import cancelled");
          q.reload();
        }}
      />
    </>
  );
}
