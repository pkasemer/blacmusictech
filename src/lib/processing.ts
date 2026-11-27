// Song processing: which uploads are stuck, working, waiting or failed, and what the buttons may do.
// The Backend decides every state and what is allowed (backend-api-admin.md, "Stuck songs"); these rules only word it.

import { fmtSpan } from "./system";

export type UploadState = "stuck" | "working" | "waiting" | "failed";

export interface ProcessingUpload {
  uploadId: string;
  title: string;
  artistId: string;
  artistName: string;
  /** "" when the release was deleted */
  releaseId: string;
  releaseTitle: string;
  status: "queued" | "processing" | "failed";
  state: UploadState;
  attempts: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  lastSignalAt: string | null;
  /** queued, but held until its transfer is worked on */
  waitingOnTransfer: boolean;
  import: null | { jobId: string; artistName: string };
  error: string;
  canRetry: boolean;
  canForce: boolean;
}

export interface ProcessingList {
  measuredAt: string;
  stuckAfterSeconds: number;
  workerLastSeenAt: string | null;
  /** failed = in the last 7 days */
  counts: Record<UploadState, number>;
  uploads: ProcessingUpload[];
}

function since(from: string | null, now: string): string {
  const ms = from ? Date.parse(now) - Date.parse(from) : NaN;
  return Number.isFinite(ms) ? fmtSpan(ms / 1000) : "";
}

/** One line saying how things stand for a song, measured by the server's own clock. */
export function describe(u: ProcessingUpload, measuredAt: string): string {
  if (u.state === "stuck") {
    const quiet = since(u.lastSignalAt ?? u.startedAt, measuredAt);
    return quiet ? `No sign of work for ${quiet}` : "No sign of work";
  }
  if (u.state === "working") {
    const running = since(u.startedAt, measuredAt);
    return running ? `Started ${running} ago` : "Being worked on";
  }
  if (u.state === "waiting") {
    if (u.waitingOnTransfer) return "Held until its song transfer is worked on";
    const waiting = since(u.updatedAt, measuredAt);
    return waiting ? `In the queue for ${waiting}` : "In the queue";
  }
  return u.error || "Processing failed";
}

/** Why a failed song has no Retry button. */
export const noRetryReason = "It cannot be retried: upload the file again.";

export function retryError(code: string, fallback: string): string {
  switch (code) {
    case "still_processing":
      return "It is being worked on again. The list has been refreshed.";
    case "already_queued":
      return "It is already back in the queue.";
    case "not_stuck":
      return "It is not stuck any more. The list has been refreshed.";
    case "file_gone":
      return "Its file is no longer stored. Upload the song again.";
    case "release_gone":
      return "Its release has been deleted, so it cannot be processed.";
    case "not_found":
      return "That upload no longer exists.";
    case "not_available":
      return "The server cannot retry songs yet. It needs the latest Backend update.";
    default:
      return fallback;
  }
}

export const SECTIONS: { state: UploadState; title: string; hint: string }[] = [
  { state: "stuck", title: "Stuck", hint: "Marked as being processed, but the worker has gone quiet. Retry puts the song back in the queue." },
  { state: "working", title: "Being worked on", hint: "A song usually takes under a minute, a very long one several minutes. Restart one only if it has clearly been going far too long." },
  { state: "waiting", title: "Waiting", hint: "In the queue, oldest first. A waiting song cannot be retried: it starts when the worker gets to it." },
  { state: "failed", title: "Failed in the last 7 days", hint: "Songs from a bulk import are not listed here: they are reported on the import itself." },
];
