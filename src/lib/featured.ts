// Featured releases: the albums and EPs the app shows under "Featured releases", in the admin's order.

import type { ReleaseDetail, ReleaseList } from "./types";

/** An older server ignores `featured=true` and lists every release, without the field: never show that as the featured list. */
export const featuredSupported = (list: ReleaseList) => list.releases.every((r) => typeof r.featured === "boolean");

/** Only albums and EPs can be featured, and not ones that were taken down or whose artist is banned. */
export function canFeature(r: Pick<ReleaseDetail, "type" | "takenDown" | "featured" | "artist">): boolean {
  return typeof r.featured === "boolean" && r.type === "album" && !r.takenDown && !r.artist?.banned;
}

export function featureError(code: string, fallback: string): string {
  if (code === "not_eligible") return "Only albums and EPs can be featured.";
  if (code === "taken_down") return "This release was taken down. Restore it first.";
  if (code === "artist_banned") return "This artist is banned.";
  if (code === "validation_error") return "The featured list changed in the meantime. It has been reloaded.";
  if (code === "not_available") return "The server cannot feature releases yet. It needs the latest Backend update.";
  return fallback;
}
