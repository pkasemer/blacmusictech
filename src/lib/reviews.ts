// The review queue: artists' new releases and profiles, and changes to live ones, wait here until an admin decides.

import type { Lyrics } from "./lyrics";

export type ReviewStatus = "pending" | "approved" | "rejected" | "withdrawn";

export interface ProfileValues {
  name: string;
  bio?: string;
  imageUrl?: string;
}

export interface ReviewRow {
  id: string;
  /** absent on a server that only reviews releases */
  subject?: "release" | "profile";
  releaseId: string;
  title: string;
  type: string;
  coverUrl?: string;
  kind: "new" | "update";
  status: ReviewStatus;
  /** goes up when the artist changes what is waiting; a decision names the one that was looked at */
  revision: number;
  artist: { id: string; name: string };
  submittedAt: string;
  publishAt: string | null;
  decidedAt: string | null;
  reason: string;
  changes: string[] | null;
}

export interface ReviewList {
  reviews: ReviewRow[];
  total: number;
  pending: number;
}

export interface Credit {
  name: string;
  role: string;
  roleLabel?: string;
  trackId?: string;
  artistId?: string;
  artistName?: string;
}

export interface ReviewTrack {
  trackId: string;
  title: string;
  trackNumber?: number | null;
  durationMs: number;
  explicit: boolean;
  genre?: string;
  visibility?: string;
  isNew?: boolean;
  /** works for an hour */
  audioUrl?: string;
  lyrics?: Lyrics | null;
  featuredArtists?: string[] | null;
}

export interface ChangeItem {
  kind: "release" | "track" | "lyrics" | "credits" | "newTrack" | "profile";
  label: string;
  field?: string;
  trackId?: string;
  approved?: unknown;
  proposed?: unknown;
}

export interface ReviewDetail extends ReviewRow {
  decidedBy: { id: string; email: string } | null;
  release: { description?: string; genre?: string; releaseDate?: string | null; visibility: string };
  tracks: ReviewTrack[] | null;
  credits: Credit[] | null;
  changeItems?: ChangeItem[] | null;
  /** release reviews: whether the artist's profile is approved, and where it waits */
  artistProfile?: { approved: boolean; reviewId?: string } | null;
  // profile reviews
  artistCreatedAt?: string;
  approved?: ProfileValues;
  proposed?: ProfileValues;
  releaseReviewIds?: string[] | null;
}

/** Tells the sidebar to count again, right after a decision. */
export const REVIEWS_CHANGED = "blac:reviews-changed";

export const isProfile = (r: ReviewRow) => r.subject === "profile";
export const kindLabel = (r: ReviewRow) => (isProfile(r) ? (r.kind === "new" ? "New artist profile" : "Profile changes") : r.kind === "new" ? "New release" : "Release changes");
export const STATUS_TONE = { pending: "amber", approved: "green", rejected: "red", withdrawn: "gray" } as const;
export const STATUS_LABEL: Record<ReviewStatus, string> = { pending: "Waiting", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn" };

/** How long something has been waiting. */
export function waited(since: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
}

/** The submission is no longer what is on screen: read it again. */
export const outdated = (code: string) => code === "not_pending" || code === "review_changed";

export function decisionError(code: string, fallback: string): string {
  if (code === "not_pending") return "This is no longer waiting: the artist withdrew it, or someone already decided. It has been reloaded.";
  if (code === "review_changed") return "The artist changed this after you opened it. It has been reloaded: check it again before deciding.";
  if (code === "uploads_pending") return "A file is still uploading or being processed. Decide once it has finished.";
  if (code === "profile_pending") return "This artist's profile is not approved yet. Approve the profile first, then this release.";
  if (code === "no_tracks") return "This release has no tracks, so it cannot go live.";
  if (code === "taken_down") return "This release was taken down. Restore it first.";
  if (code === "artist_banned") return "This artist is banned.";
  return fallback;
}

/** A changed value in words. */
export function fieldText(field: string | undefined, value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field === "trackNumber" && !value) return "Not set";
  if (value === null || value === undefined || value === "") return "None";
  return String(value);
}

export function creditText(c: Credit, tracks: ReviewTrack[]): string {
  const role = c.roleLabel || c.role.replace(/_/g, " ");
  const where = c.trackId ? (tracks.find((t) => t.trackId === c.trackId)?.title ?? "one song") : "every song";
  return `${c.artistName || c.name} · ${role} · ${where}`;
}
