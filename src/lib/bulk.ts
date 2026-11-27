// Publishing several releases at once: one request each, in order, so every release is checked and audited on its own
// and one refusal never blocks the others.

import { ApiError } from "./api";
import type { ReleaseRow } from "./types";

export interface BulkItem {
  id: string;
  title: string;
  artistName: string;
}

export type BulkOutcome = "done" | "failed" | "not_tried";

export interface BulkResult {
  item: BulkItem;
  outcome: BulkOutcome;
  message?: string;
  /** the release does not exist any more, so there is nothing left to retry */
  gone?: boolean;
}

/** Why a release cannot be ticked, or null when it can be published (a scheduled one can be published early). */
export function whyNotSelectable(r: Pick<ReleaseRow, "visibility" | "takenDown" | "trackCount">): string | null {
  if (r.takenDown) return "Taken down: restore it first";
  if (r.visibility === "public") return "Already public";
  if (r.trackCount === 0) return "No tracks yet";
  return null;
}

export function publishProblem(code: string, fallback: string): string {
  switch (code) {
    case "no_tracks":
      return "It has no finished tracks yet.";
    case "uploads_pending":
      return "A file is still uploading or being processed. Try again once it has finished.";
    case "taken_down":
      return "It was taken down. Restore it first.";
    case "artist_banned":
      return "Its artist is banned.";
    case "not_found":
      return "It no longer exists.";
    default:
      return fallback;
  }
}

/** Statuses after which more requests are pointless: signed out, not allowed, or told to slow down. */
const STOP = new Set([401, 403, 429]);

export async function runBulk(items: BulkItem[], publishOne: (item: BulkItem) => Promise<unknown>, onResult: (r: BulkResult) => void, shouldStop: () => boolean = () => false): Promise<BulkResult[]> {
  const out: BulkResult[] = [];
  const add = (r: BulkResult) => {
    out.push(r);
    onResult(r);
  };
  let halted = "";
  for (const item of items) {
    if (!halted && shouldStop()) halted = "Stopped before this one.";
    if (halted) {
      add({ item, outcome: "not_tried", message: halted });
      continue;
    }
    try {
      await publishOne(item);
      add({ item, outcome: "done" });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      add({ item, outcome: "failed", message: err ? publishProblem(err.code, err.message) : "Could not publish.", ...(err?.code === "not_found" ? { gone: true } : {}) });
      if (err && STOP.has(err.status)) halted = "Not tried: the server stopped accepting requests.";
    }
  }
  return out;
}

/** What to untick afterwards: everything published, and anything that no longer exists. The rest stays for another try. */
export function settled(results: BulkResult[]): string[] {
  return results.filter((r) => r.outcome === "done" || r.gone).map((r) => r.item.id);
}

export function summary(results: BulkResult[], scheduled: boolean): string {
  const n = (o: BulkOutcome) => results.filter((r) => r.outcome === o).length;
  const parts = [`${n("done")} ${scheduled ? "scheduled" : "published"}`];
  if (n("failed")) parts.push(`${n("failed")} failed`);
  if (n("not_tried")) parts.push(`${n("not_tried")} not tried`);
  return parts.join(", ");
}
