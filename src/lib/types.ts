// The admin API contract as the site uses it. Source of truth: the Backend session's backend-api-admin.md
// (shapes below follow admin-site-endpoint-requests.md and are corrected when the Backend publishes them).

export interface Paged {
  total: number;
}

export interface BanInfo {
  at: string;
  reason: string;
  by?: { id: string; email: string } | string | null;
}

// ---------------------------------------------------------------- users
export interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
  emailVerified: boolean;
  banned: boolean;
  hasArtist: boolean;
  createdAt: string;
}
export interface UserList extends Paged {
  users: UserRow[];
}
export interface UserDetail extends UserRow {
  ban: BanInfo | null;
  signIn: { password: boolean; apple: boolean; google: boolean };
  artist: { id: string; name: string } | null;
  counts: { playlists: number; followedArtists: number; savedItems: number };
  lastSeenAt: string | null;
  pushEnabled: boolean;
}
export interface UserDeletionPreview {
  artist: { id: string; name: string } | null;
  releases: number;
  tracks: number;
  playlists: number;
  uploads: number;
  storageBytes: number;
  libraryItems: number;
  sessions: number;
}

// -------------------------------------------------------------- artists
export type Verification = "unverified" | "pending" | "verified" | "rejected";

export interface ArtistRow {
  id: string;
  name: string;
  imageUrl?: string;
  verification: Verification;
  flagged: boolean;
  banned: boolean;
  ownerUserId?: string;
  ownerEmail?: string;
  releaseCount: number;
  followerCount: number;
  createdAt: string;
  verificationMessage?: string;
  requestedAt?: string;
  /** the verification queue before the Backend's general artist list shipped: "pending" | "flagged" */
  status?: string;
}
export interface ArtistList extends Paged {
  artists: ArtistRow[];
}
export interface StorageGrant {
  id: number;
  kind: string;
  bytes: number;
  note: string;
  reference?: string;
  expiresAt?: string;
  createdAt: string;
}
export interface ArtistDetail {
  id: string;
  name: string;
  bio: string;
  imageUrl?: string;
  verification: { state: Verification; message: string; note: string; requestedAt: string | null };
  flagged: boolean;
  ban: BanInfo | null;
  owner: { id: string; email: string; displayName: string } | null;
  storage: { usedBytes: number; quotaBytes: number };
  counts: { releases: number; publicReleases: number; tracks: number; followers: number; plays: number };
  recentGrants: StorageGrant[];
  createdAt: string;
}
export interface ArtistDeletionPreview {
  releases: number;
  tracks: number;
  uploads: number;
  storageBytes: number;
  storageGrants: number;
  followers: number;
}

// ------------------------------------------------------------- releases
export type Visibility = "draft" | "scheduled" | "public";

export interface ReleaseRow {
  id: string;
  title: string;
  type: "single" | "album";
  /** single | ep | album (an album of 1-6 tracks is an EP) */
  kind?: "single" | "ep" | "album";
  artistId: string;
  artistName: string;
  /** the stored state: a taken-down release is stored as draft, see previousVisibility */
  visibility: Visibility;
  takenDown: boolean;
  previousVisibility?: Visibility;
  trackCount: number;
  coverUrl?: string;
  publishedAt?: string | null;
  createdAt: string;
}
export interface ReleaseList extends Paged {
  releases: ReleaseRow[];
}
export interface TrackRow {
  id: string;
  title: string;
  trackNumber?: number;
  durationMs: number;
  visibility: "draft" | "public";
  explicit: boolean;
  genre: string;
}
export interface ReleaseDetail extends ReleaseRow {
  description: string;
  genre: string;
  releaseDate?: string;
  publishAt?: string | null;
  updatedAt?: string;
  artist?: { id: string; name: string; banned: boolean } | null;
  takedown: null | { at: string; reason: string; by: { id: string; email: string } | null; previousVisibility: Visibility; byBan: boolean };
  tracks: TrackRow[];
  /** audio uploads that are not tracks yet (still uploading, processing, or failed) */
  uploads?: UploadItem[];
}
export type UploadStatus = "pending" | "queued" | "processing" | "ready" | "failed";
export interface UploadItem {
  id: string;
  status: UploadStatus;
  title: string;
  filename: string;
  sizeBytes: number;
  trackNumber?: number;
  trackId?: string;
  error?: string;
}
/** What the site's server returns when an upload starts: sealed tokens, never storage addresses. */
export interface UploadStart {
  id: string;
  status: UploadStatus;
  plan: { type: "single" | "multipart"; partSize?: number; partCount: number; parts: { number: number; token: string }[] };
}
export interface UploadParts {
  partSize?: number;
  partCount: number;
  /** the parts already stored: numbers, or {number,size} objects */
  uploaded: (number | { number: number; size: number })[];
  parts: { number: number; token: string }[];
}
export interface GenreList {
  genres: { id: string; name: string }[];
}
export interface ReleaseDeletionPreview {
  tracks: number;
  files: number;
  storageBytes: number;
  libraryReferences: number;
  playlistReferences: number;
}

// ------------------------------------------------------------ playlists
export interface PlaylistRow {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  isFeatured: boolean;
  /** public AND featured: what Home shows */
  published?: boolean;
  trackCount: number;
  /** tracks listeners can actually play */
  playableTrackCount?: number;
  coverUrl?: string;
  updatedAt: string;
  groups?: { id: string; title: string }[];
}
export interface PlaylistList extends Paged {
  playlists: PlaylistRow[];
}
export interface PlaylistItem {
  itemId: string;
  trackId: string;
  title: string;
  artistName: string;
  durationMs: number;
  position: number;
  /** false when the track is not public (the listener will not see it) */
  public: boolean;
}
export interface PlaylistDetail extends PlaylistRow {
  items: PlaylistItem[];
}
export interface SearchTrack {
  id?: string;
  title: string;
  artistName?: string;
  durationMs: number;
  albumTitle?: string;
}

// ----------------------------------------------------------------- stats
export interface Overview {
  users: { total: number; verifiedEmail: number; banned: number; new7d: number; new30d: number };
  artists: { total: number; verified: number; pendingVerification: number; banned: number };
  releases: { total: number; public: number; draft: number; scheduled: number; takenDown: number };
  tracks: { total: number };
  shows: { total: number };
  plays: { total: number; last7d: number; last30d: number; uniqueListeners30d: number };
  storageBytes: number;
}
export type Metric = "signups" | "artists" | "releases" | "plays" | "searches" | "searches_no_results";
export interface Timeseries {
  points: { date: string; count: number }[];
}
export interface TopList {
  items: { id: string; name: string; plays: number }[];
}

// ------------------------------------------------------------------ audit
export interface AuditEntry {
  id: number;
  at: string;
  actor: { id: string; email: string };
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  reason: string;
  details?: Record<string, unknown>;
  ip?: string;
}
export interface AuditList extends Paged {
  entries: AuditEntry[];
}

// --------------------------------------------------- sections (playlist groups)
/** A titled shelf in the app with playlists in it. A playlist can be in several sections. */
export interface Section {
  id: string;
  title: string;
  description: string;
  /** lower numbers come first in the app */
  position: number;
  isActive: boolean;
  /** how many of its playlists are listed right now (public ones) */
  playlistCount: number;
  playlistIds: string[];
}
export interface SectionList {
  groups: Section[];
}

// --------------------------------------------------------------- cover images
export interface UploadedImage {
  id: string;
  status: "ready" | "pending" | "failed";
  urls?: { small?: string; medium?: string; large?: string };
}

// ------------------------------------------------------------------- playback
/** GET /v1/playback/{trackId}: the link sits inside `playback`. */
export interface Playback {
  trackId: string;
  source?: string;
  playback: { mode: string; url?: string; expiresAt?: string; quality?: string };
}

// ---------------------------------------------------------------- search insights
export type SearchRange = "7d" | "30d" | "90d";
export interface SearchOverview {
  searches: number;
  uniqueQueries: number;
  noResultSearches: number;
  /** 0..1 */
  noResultRate: number;
  previous: { searches: number; noResultSearches: number };
}
export interface SearchTopItem {
  query: string;
  count: number;
  noResultCount: number;
  previousCount: number;
  lastAt: string;
}
export interface SearchTopList extends Paged {
  items: SearchTopItem[];
}
export interface SearchKinds {
  items: { kind: string; count: number }[];
}
export interface SearchGapItem {
  query: string;
  count: number;
  lastAt: string;
}
export interface SearchGapList extends Paged {
  items: SearchGapItem[];
}

// ------------------------------------------------------------------ server (storage and load), read only
export interface ServerUsage {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
}
export interface StorageCount {
  objects: number;
  bytes: number;
}
export interface ServerInfo {
  measuredAt: string;
  /** the whole machine; null only where it cannot be measured */
  server: null | { cpuCount: number; load: { "1m": number; "5m": number; "15m": number }; uptimeSeconds: number; memory: ServerUsage; swap: ServerUsage; disk: ServerUsage };
  storage: {
    /** stored files are counted once an hour; null until the first count */
    measuredAt: string | null;
    objects: number | null;
    objectBytes: number | null;
    byKind: null | { audioOriginals: StorageCount; audioPlayback: StorageCount; images: StorageCount; other: StorageCount };
    databaseBytes: number;
    otherBytes: number | null;
  };
  topArtists: { artistId: string; name: string; tracks: number; bytes: number }[];
  work: {
    uploads: { pending: number; queued: number; processing: number; failedLast24h: number; oldestQueuedSeconds: number };
    imports: { awaitingFiles: number; processing: number };
    emails: { waiting: number; failedLast24h: number };
    push: { waiting: number; failedLast24h: number };
  };
  lastSampleAt: string | null;
  alerts: { level: "warning" | "critical"; code: string; message: string }[];
}
export interface ServerHistoryPoint {
  at: string;
  load: number;
  memoryUsedPercent: number;
  diskUsedBytes: number;
  diskFreeBytes: number;
  uploadsWaiting: number;
}
export interface ServerHistory {
  hours: number;
  stepSeconds: number;
  points: ServerHistoryPoint[];
}
