// Combining several of an artist's releases into one album or EP. The originals are replaced: their songs move.

import type { ReleaseRow, Visibility } from "./types";

export const combinable = (r: Pick<ReleaseRow, "takenDown" | "trackCount">) => !r.takenDown && r.trackCount > 0;

/** The app calls an album of up to 6 songs an EP; the Backend decides this from the number of songs. */
export const albumKind = (songs: number) => (songs <= 6 ? "EP" : "album");

/** Keeps the order the admin made, drops songs no longer picked, and adds newly picked ones at the end. */
export function keepOrder(order: string[], present: string[]): string[] {
  const kept = order.filter((id) => present.includes(id));
  return [...kept, ...present.filter((id) => !kept.includes(id))];
}

export function move<T>(list: T[], from: number, by: -1 | 1): T[] {
  const to = from + by;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** Published only when everything picked already is, so combining never publishes a draft by itself. */
export function defaultVisibility(picked: Pick<ReleaseRow, "visibility">[]): "draft" | "public" {
  return picked.length > 0 && picked.every((r) => r.visibility === "public") ? "public" : "draft";
}

/** What the chosen visibility changes for listeners, or null when nothing changes. */
export function visibilityWarning(picked: { visibility: Visibility }[], choice: "draft" | "public"): string | null {
  const pub = picked.filter((r) => r.visibility === "public").length;
  if (choice === "draft" && pub > 0) return "Some of these songs are public now. As a draft, listeners will not see them until you publish.";
  if (choice === "public" && pub < picked.length) return "Some of these songs are not public yet. Publishing makes them public now.";
  return null;
}

export function singleError(code: string, status: number, fallback: string): string {
  if (code === "not_available" || status === 405) return "The server cannot make a single from a song yet. It needs the latest Backend update.";
  if (code === "already_single") return "This song is already a single.";
  if (code === "not_found") return "That song no longer exists.";
  if (code === "uploads_pending") return "A file is still uploading or being processed. Try again once it has finished.";
  if (code === "taken_down") return "This release was taken down. Restore it first.";
  return combineError(code, status, fallback);
}

export function combineError(code: string, status: number, fallback: string): string {
  if (code === "not_available" || status === 405) return "The server cannot combine releases yet. It needs the latest Backend update.";
  switch (code) {
    case "different_artists":
      return "These releases do not all belong to this artist.";
    case "artist_banned":
      return "This artist is banned.";
    case "taken_down":
      return "One of these releases was taken down. Restore it first.";
    case "uploads_pending":
      return "A file is still uploading or being processed. Try again once it has finished.";
    case "no_tracks":
      return "One of these releases has no finished song.";
    case "invalid_genre":
      return "Choose a genre from the list.";
    case "not_found":
      return "One of these releases no longer exists. Close this and look again.";
    default:
      return fallback;
  }
}
