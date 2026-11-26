// Import keys and bulk import runs, as the Backend reports them (see backend-api-bulk-import.md).

export interface ApiKey {
  id: string;
  name: string;
  /** the first characters of the key, enough to recognise it; the rest is never shown again */
  prefix: string;
  /** the administrator who made it (email) */
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}
export interface ApiKeyList {
  keys: ApiKey[];
}
/** The one answer that carries the whole key. */
export interface CreatedApiKey {
  id: string;
  name: string;
  prefix: string;
  scope: string;
  expiresAt: string;
  key: string;
}

export type KeyState = "active" | "expired" | "revoked";

export function keyState(k: Pick<ApiKey, "revokedAt" | "expiresAt">, now = Date.now()): KeyState {
  if (k.revokedAt) return "revoked";
  return new Date(k.expiresAt).getTime() <= now ? "expired" : "active";
}

export type JobStatus = "pending" | "processing" | "completed" | "completed_with_errors" | "failed" | "cancelled";
export type ImportTrackStatus = "waiting" | "processing" | "created" | "skippedDuplicate" | "failed";

export interface ImportJob {
  jobId: string;
  status: JobStatus;
  artist: string;
  artistId?: string;
  type: "single" | "album";
  visibility: "draft" | "public";
  totalTracks: number;
  created: number;
  skippedDuplicate: number;
  failed: number;
  remaining: number;
  bytesStored: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** only on a single job */
  results?: {
    title: string;
    status: ImportTrackStatus;
    releaseId?: string;
    trackId?: string;
    durationSeconds?: number;
    duration?: string;
    note?: string;
  }[];
  /** null in the list */
  errors?: { title?: string; file?: string; code: string; message: string }[] | null;
  warnings?: string[] | null;
}
export interface ImportList {
  imports: ImportJob[];
}

/** A job that can still change by itself, so the page should keep refreshing. */
export function isLive(status: JobStatus): boolean {
  return status === "pending" || status === "processing";
}

/** How far a run is, from 0 to 1: every track that is finished (added, skipped or failed). */
export function progressOf(j: Pick<ImportJob, "totalTracks" | "created" | "skippedDuplicate" | "failed">): number {
  if (j.totalTracks <= 0) return 0;
  return Math.max(0, Math.min(1, (j.created + j.skippedDuplicate + j.failed) / j.totalTracks));
}

export const JOB_LABEL: Record<JobStatus, string> = {
  pending: "Waiting for files",
  processing: "Processing",
  completed: "Completed",
  completed_with_errors: "Completed with errors",
  failed: "Failed",
  cancelled: "Cancelled",
};
