// What the import queue is doing, worked out the way the Backend runs it (importer/runner.go):
// started jobs are served in order of when they started (then id), their songs in list order, two songs at a time.
// The API calls every started job "processing", also the ones still waiting their turn; only a job's per-track
// results show whether one of its songs is really being worked on.

import { isLive, type ImportJob, type ImportList } from "./imports";

/**
 * The live server's average time per song, measured over whole runs (so it already allows for two being in flight).
 * Estimates only: it can take nearly twice as long.
 */
export const SECONDS_PER_SONG = 42;

/** Started jobs, in the order the server serves them. */
export function startedInOrder(jobs: ImportJob[]): ImportJob[] {
  return jobs
    .filter((j) => j.status === "processing")
    .sort((a, b) => (a.startedAt ?? a.createdAt).localeCompare(b.startedAt ?? b.createdAt) || a.jobId.localeCompare(b.jobId));
}

export interface SongRef {
  jobId: string;
  artist: string;
  title: string;
  /** its number in its own import, from 1 */
  number: number;
}

export interface QueueEntry {
  job: ImportJob;
  /** 1 for the next import to get a turn */
  place: number;
  /** rough seconds until its first song starts */
  startsIn: number;
}

export interface Queue {
  /** songs being converted right now */
  now: SongRef[];
  /** imports with a song being converted, with rough seconds until each finishes */
  running: { job: ImportJob; finishesIn: number }[];
  /** started imports still waiting their turn, in order */
  queued: QueueEntry[];
  /** the next songs that will be converted, in order (as far as the loaded details reach) */
  upNext: SongRef[];
  /** created but the script has not sent all the files: not in the queue yet, oldest first */
  awaitingFiles: ImportJob[];
  /** newest first */
  finished: ImportJob[];
  songsWaiting: number;
}

/** `details` holds the single-job answers (with per-track results) for the first jobs in line. */
export function buildQueue(jobs: ImportJob[], details: ReadonlyMap<string, ImportJob>, upNextLimit = 8): Queue {
  const started = startedInOrder(jobs);
  const now: SongRef[] = [];
  const upNext: SongRef[] = [];
  const running: Queue["running"] = [];
  const queued: QueueEntry[] = [];
  let ahead = 0; // songs that will be served before the job being looked at
  let reachable = true; // false once a job's songs are unknown: later "next songs" would skip over it
  for (const listed of started) {
    const detail = details.get(listed.jobId);
    const job = detail ?? listed;
    const rows = (detail?.results ?? []).map((r, i) => ({ ...r, number: i + 1 }));
    const ref = (r: (typeof rows)[number]): SongRef => ({ jobId: job.jobId, artist: job.artist, title: r.title, number: r.number });
    const converting = rows.filter((r) => r.status === "processing");
    now.push(...converting.map(ref));
    if (!detail) reachable = false;
    if (reachable) for (const r of rows) if (r.status === "waiting" && upNext.length < upNextLimit) upNext.push(ref(r));
    if (converting.length > 0) running.push({ job, finishesIn: (ahead + job.remaining) * SECONDS_PER_SONG });
    else queued.push({ job, place: queued.length + 1, startsIn: ahead * SECONDS_PER_SONG });
    ahead += job.remaining;
  }
  const newest = (a: ImportJob, b: ImportJob) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt);
  return {
    now,
    running,
    queued,
    upNext,
    awaitingFiles: jobs.filter((j) => j.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    finished: jobs.filter((j) => !isLive(j.status)).sort(newest),
    songsWaiting: Math.max(0, started.reduce((s, j) => s + (details.get(j.jobId) ?? j).remaining, 0) - now.length),
  };
}

/**
 * The latest runs plus the answer to `?state=unfinished`. A server that does not know the query answers with the latest runs
 * again (finished ones included); then unfinished imports older than the latest 20 may be missing, which `incomplete` says.
 */
export function mergeLists(latest: ImportList, unfinished: ImportList | undefined): { jobs: ImportJob[]; incomplete: boolean } {
  const supported = !!unfinished && unfinished.imports.every((j) => isLive(j.status));
  const byId = new Map(latest.imports.map((j) => [j.jobId, j]));
  if (supported) for (const j of unfinished.imports) byId.set(j.jobId, j);
  const jobs = [...byId.values()];
  const oldest = [...latest.imports].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  // 20 is what the server returns at most: if the oldest of a full page is still unfinished, older ones may be too
  const incomplete = !supported && latest.imports.length >= 20 && !!oldest && isLive(oldest.status);
  return { jobs, incomplete };
}

/** The answer to `?state=finished`: every completed, failed and cancelled import, newest finished first. */
export interface FinishedPage extends ImportList {
  total?: number;
}

export type FinishedSource =
  | { kind: "loading" }
  /** the server's own list of finished imports, with how many there are in all */
  | { kind: "server"; rows: ImportJob[]; total: number }
  /** an older server: only what is among the 20 newest imports; `complete` when that is every import there is */
  | { kind: "recent"; rows: ImportJob[]; complete: boolean }
  | { kind: "error"; rows: ImportJob[] };

/**
 * Where the finished imports come from. The 20 newest can all be unfinished, so "none among them" must never be
 * shown as "none". A server without the finished list answers `400 bad_request`, or ignores the query.
 */
export function finishedSource(latest: ImportList | undefined, answer: FinishedPage | undefined, error?: { status: number; code: string }): FinishedSource {
  if (answer && typeof answer.total === "number" && answer.imports.every((j) => !isLive(j.status))) return { kind: "server", rows: answer.imports, total: answer.total };
  if (!latest || (!answer && !error)) return { kind: "loading" };
  const rows = latest.imports.filter((j) => !isLive(j.status)).sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt));
  const oldServer = !!answer || (error?.status === 400 && error.code === "bad_request");
  return oldServer ? { kind: "recent", rows, complete: latest.imports.length < 20 } : { kind: "error", rows };
}

/** The number to show for finished imports: never a 0 that only means "the server did not say". */
export function finishedCount(s: FinishedSource): string {
  if (s.kind === "loading") return "…";
  if (s.kind === "server") return s.total.toLocaleString();
  if (s.kind === "recent" && s.complete) return s.rows.length.toLocaleString();
  return s.rows.length > 0 ? `${s.rows.length}+` : "–";
}

export type FinishedFilter = "all" | "problems" | "completed" | "cancelled";

export function matchesFinished(j: ImportJob, f: FinishedFilter): boolean {
  if (f === "problems") return j.failed > 0 || j.status === "failed";
  if (f === "completed") return j.status === "completed";
  if (f === "cancelled") return j.status === "cancelled";
  return true;
}

export function roughly(seconds: number): string {
  if (seconds < 60) return "under a minute";
  const m = Math.round(seconds / 60);
  if (m < 60) return `about ${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `about ${h} h ${m % 60} min` : `about ${h} h`;
}

export type TrackFilter = "all" | NonNullable<ImportJob["results"]>[number]["status"];

/** For a long track list: what is happening first, then what is coming (in order), then problems, then what is done. */
const RANK: Record<Exclude<TrackFilter, "all">, number> = { processing: 0, waiting: 1, failed: 2, created: 3, skippedDuplicate: 4 };

export function orderTracks(results: NonNullable<ImportJob["results"]>) {
  return results.map((r, i) => ({ ...r, number: i + 1 })).sort((a, b) => RANK[a.status] - RANK[b.status] || a.number - b.number);
}
