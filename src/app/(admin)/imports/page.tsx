"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IImport, IKey, IRefresh } from "@/components/icons";
import { Chips, JobStatusBadge } from "@/components/import-parts";
import { useToast } from "@/components/Shell";
import { Button, Card, Empty, ErrorBox, Loading, PageHeader, Progress, Table, Td, Th, Tile, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { SECONDS_PER_SONG, buildQueue, finishedCount, finishedSource, matchesFinished, mergeLists, roughly, startedInOrder, type FinishedFilter, type Queue, type SongRef } from "@/lib/importQueue";
import { isLive, progressOf, type ImportJob, type ImportList } from "@/lib/imports";
import { useApi, usePoll } from "@/lib/useApi";
import { useDetails, useFinished } from "@/lib/useDetails";

/** How many of the first jobs in line are opened for their song names. */
const OPENED = 5;
const FINISHED_STEP = 15;

function size(j: ImportJob) {
  return j.type === "album" ? `album, ${j.totalTracks} songs` : `${j.totalTracks} song${j.totalTracks === 1 ? "" : "s"}`;
}

function JobLink({ j }: { j: Pick<ImportJob, "jobId" | "artist"> }) {
  return (
    <Link href={`/imports/${j.jobId}`} className="font-medium hover:text-primary">
      {j.artist}
    </Link>
  );
}

function SongList({ songs, numbered }: { songs: SongRef[]; numbered?: boolean }) {
  return (
    <ol className="divide-y divide-line text-sm">
      {songs.map((s, i) => (
        <li key={`${s.jobId}-${s.number}`} className="flex items-baseline gap-3 py-1.5">
          {numbered && <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted">{i + 1}</span>}
          <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
          <Link href={`/imports/${s.jobId}`} className="max-w-[45%] shrink-0 truncate text-xs text-muted hover:text-primary">
            {s.artist}
          </Link>
        </li>
      ))}
    </ol>
  );
}

function NowAndNext({ queue, loading }: { queue: Queue; loading: boolean }) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <Card title="Importing now">
        {queue.now.length === 0 ? (
          <p className="text-sm text-muted">{loading ? "Looking up the songs…" : queue.queued.length > 0 ? "No song is being converted at this moment. If this lasts more than a few minutes, check the Server page." : "No song is being imported."}</p>
        ) : (
          <SongList songs={queue.now} />
        )}
        {queue.running.map(({ job, finishesIn }) => (
          <div key={job.jobId} className="mt-3 border-t border-line pt-3">
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <JobLink j={job} />
              <span className="shrink-0 text-xs text-muted">
                {job.totalTracks - job.remaining} of {job.totalTracks} finished · {roughly(finishesIn)} left
              </span>
            </div>
            <Progress value={progressOf(job) * 100} label={`Progress of the ${job.artist} import`} tone={job.failed > 0 ? "amber" : "blue"} />
          </div>
        ))}
      </Card>
      <Card title="Next songs, in order">
        {queue.upNext.length === 0 ? <p className="text-sm text-muted">{loading ? "Looking up the songs…" : "Nothing else is waiting."}</p> : <SongList songs={queue.upNext} numbered />}
        {queue.songsWaiting > queue.upNext.length && <p className="mt-2 text-xs text-muted">And {fmtNum(queue.songsWaiting - queue.upNext.length)} more waiting after these.</p>}
      </Card>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      {children}
    </section>
  );
}

export default function ImportsPage() {
  const latest = useApi<ImportList>("/imports");
  const unfinished = useApi<ImportList>("/imports?state=unfinished");
  const toast = useToast();
  const [cancelling, setCancelling] = useState<ImportJob | null>(null);
  const [view, setView] = useState<"queue" | "finished">("queue");
  const [filter, setFilter] = useState<FinishedFilter>("all");
  const [shown, setShown] = useState(FINISHED_STEP);
  const [want, setWant] = useState(100);
  const merged = useMemo(() => (latest.data ? mergeLists(latest.data, unfinished.data) : undefined), [latest.data, unfinished.data]);
  const jobs = useMemo(() => merged?.jobs ?? [], [merged]);
  const live = jobs.some((j) => isLive(j.status));
  const { reload: reloadLatest } = latest;
  const { reload: reloadUnfinished } = unfinished;
  const reload = useMemo(() => () => (reloadLatest(), reloadUnfinished()), [reloadLatest, reloadUnfinished]);
  usePoll(live, reload);
  const opened = startedInOrder(jobs)
    .slice(0, OPENED)
    .map((j) => j.jobId);
  const details = useDetails(opened, latest.data);
  const queue = buildQueue(jobs, details);
  const looking = opened.some((id) => !details.has(id));
  const past = useFinished(want, latest.data);
  const source = finishedSource(latest.data, past.data, past.error);
  const loaded = source.kind === "loading" ? [] : source.rows;
  const more = source.kind === "server" && source.total > loaded.length;
  const hidden = source.kind === "recent" && !source.complete;
  const finished = loaded.filter((j) => matchesFinished(j, filter));
  const count = (f: FinishedFilter) => loaded.filter((j) => matchesFinished(j, f)).length;
  const problems = count("problems");
  const unfinishedCount = queue.running.length + queue.queued.length + queue.awaitingFiles.length;

  const cancelButton = (j: ImportJob) => (
    <Button small variant="ghost" className="text-danger-ink hover:bg-danger/10 hover:text-danger-ink" onClick={() => setCancelling(j)}>
      Cancel
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Imports"
        subtitle="What a script is importing: what is being worked on, what comes next, and what is done."
        actions={
          <>
            <Link href="/api-keys">
              <Button>
                <IKey size={14} /> API keys
              </Button>
            </Link>
            <Button onClick={reload} disabled={latest.loading}>
              <IRefresh size={14} /> Refresh
            </Button>
          </>
        }
      />
      {latest.error && <ErrorBox error={latest.error} onRetry={reload} />}
      {!latest.data && !latest.error && <Loading />}
      {latest.data && jobs.length === 0 && <Empty icon={<IImport size={20} />}>No imports yet.</Empty>}
      {jobs.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Songs importing now" value={fmtNum(queue.now.length)} />
            <Tile label="Songs waiting in the queue" value={fmtNum(queue.songsWaiting)} sub={queue.songsWaiting > 0 ? `${roughly((queue.songsWaiting + queue.now.length) * SECONDS_PER_SONG)} to get through` : undefined} />
            <Tile label="Imports not started yet" value={fmtNum(queue.awaitingFiles.length)} />
            <Tile
              label="Finished imports"
              value={finishedCount(source)}
              sub={hidden ? "Older ones cannot be listed yet" : source.kind === "error" ? "Could not read them all" : problems > 0 ? `${problems} with problems${more ? ` in the newest ${loaded.length}` : ""}` : undefined}
              tone={problems > 0 ? "warn" : undefined}
            />
          </div>

          {merged?.incomplete && (
            <p role="status" className="mt-3 rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink">
              The server only lists the 20 newest imports, and there may be older unfinished ones ahead of these. The queue order below can be incomplete until the server is updated.
            </p>
          )}

          <div className="mt-5">
            <Chips
              label="Show"
              value={view}
              onChange={setView}
              options={[
                { value: "queue", label: "In progress and waiting", count: unfinishedCount },
                { value: "finished", label: "Finished", count: finishedCount(source) },
              ]}
            />
          </div>

          {view === "queue" &&
            (unfinishedCount === 0 ? (
              <div className="mt-4">
                <Empty icon={<IImport size={20} />}>Nothing is being imported or waiting. Finished imports are under “Finished”.</Empty>
              </div>
            ) : (
              <div className="mt-4">
                <NowAndNext queue={queue} loading={looking} />

                {queue.queued.length > 0 && (
                  <Section title={`Waiting their turn (${queue.queued.length})`} hint="All files have arrived. The server takes these in this order. Times are rough.">
                    <Table>
                      <thead>
                        <tr>
                          <Th className="w-16">Place</Th>
                          <Th>Artist</Th>
                          <Th>Songs left</Th>
                          <Th>Starts in</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {queue.queued.map(({ job, place, startsIn }) => (
                          <tr key={job.jobId} className="hover:bg-sunken/50">
                            <Td className={cx("tabular-nums", place === 1 ? "font-semibold text-primary" : "text-muted")}>{place === 1 ? "Next" : place}</Td>
                            <Td>
                              <JobLink j={job} />
                              <span className="ml-2 text-xs text-muted">{size(job)}</span>
                            </Td>
                            <Td className="tabular-nums">{job.remaining}</Td>
                            <Td className="text-muted">{roughly(startsIn)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Section>
                )}

                {queue.awaitingFiles.length > 0 && (
                  <Section title={`Not started yet (${queue.awaitingFiles.length})`} hint="Not in the queue. The script may still be sending files, or the server may have refused to start the import, for example because disk space is short. Don’t create it again while it is listed here. An import not started within 24 hours is cancelled.">
                    <Table>
                      <thead>
                        <tr>
                          <Th>Artist</Th>
                          <Th>Songs</Th>
                          <Th>Created</Th>
                          <Th />
                        </tr>
                      </thead>
                      <tbody>
                        {queue.awaitingFiles.map((j) => (
                          <tr key={j.jobId} className="hover:bg-sunken/50">
                            <Td>
                              <JobLink j={j} />
                            </Td>
                            <Td className="text-muted">{size(j)}</Td>
                            <Td className="whitespace-nowrap text-muted">{fmtDateTime(j.createdAt)}</Td>
                            <Td className="text-right">{cancelButton(j)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Section>
                )}
                <p className="mt-3 text-xs text-muted">Refreshes every 15 seconds. Times assume about 42 seconds per song, the live server&rsquo;s average. It can take longer, because uploads from other people share the same converter.</p>
              </div>
            ))}

          {view === "finished" && (
            <div className="mt-4">
              {hidden && (
                <p role="status" className="mb-3 rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink">
                  The server cannot list past imports yet. It only sends the 20 newest imports, so finished ones older than those are missing here. This needs a server update; until then, the audit log shows what was imported.
                </p>
              )}
              {source.kind === "error" && past.error && (
                <div className="mb-3">
                  <ErrorBox error={past.error} onRetry={past.retry} />
                </div>
              )}
              {loaded.length > 0 && (
                <div className="mb-3">
                  <Chips
                    label="Result"
                    value={filter}
                    onChange={(f) => (setFilter(f), setShown(FINISHED_STEP))}
                    options={[
                      { value: "all", label: "All", count: more ? finishedCount(source) : count("all") },
                      { value: "problems", label: "With problems", count: count("problems") },
                      { value: "completed", label: "All songs fine", count: count("completed") },
                      { value: "cancelled", label: "Cancelled", count: count("cancelled") },
                    ]}
                  />
                </div>
              )}
              {more && <p className="mb-2 text-xs text-muted">Showing from the {fmtNum(loaded.length)} newest finished imports; the filters and their counts cover only those.</p>}
              {source.kind === "loading" ? (
                <Loading />
              ) : finished.length === 0 ? (
                <Empty>{hidden && loaded.length === 0 ? "None of the 20 newest imports has finished. Older finished imports cannot be listed yet." : source.kind === "error" && loaded.length === 0 ? "The finished imports could not be read." : "No finished imports match."}</Empty>
              ) : (
                <>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Artist</Th>
                        <Th>Status</Th>
                        <Th>Result</Th>
                        <Th>Finished</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {finished.slice(0, shown).map((j) => (
                        <tr key={j.jobId} className="hover:bg-sunken/50">
                          <Td>
                            <JobLink j={j} />
                            <span className="ml-2 text-xs text-muted">{size(j)}</span>
                          </Td>
                          <Td>
                            <JobStatusBadge status={j.status} />
                          </Td>
                          <Td className="whitespace-nowrap text-xs">
                            <span className="text-success-ink">{j.created} added</span>
                            {j.skippedDuplicate > 0 && <span className="text-muted"> · {j.skippedDuplicate} already there</span>}
                            {j.failed > 0 && <span className="text-danger-ink"> · {j.failed} failed</span>}
                          </Td>
                          <Td className="whitespace-nowrap text-muted">{fmtDateTime(j.finishedAt ?? j.createdAt)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {finished.length > shown && (
                    <div className="mt-3">
                      <Button small onClick={() => setShown((n) => n + FINISHED_STEP)}>
                        Show more ({finished.length - shown} left)
                      </Button>
                    </div>
                  )}
                </>
              )}
              {more && finished.length <= shown && (
                <div className="mt-3">
                  <Button small onClick={() => setWant((n) => n + 100)}>
                    Load older imports
                  </Button>
                </div>
              )}
              {source.kind === "server" && <p className="mt-3 text-xs text-muted">Completed, failed and cancelled imports, the most recently finished first.</p>}
            </div>
          )}
        </>
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
          reload();
        }}
      />
    </>
  );
}
