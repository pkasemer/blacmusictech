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
  artistId: string;
  artistName: string;
  visibility: Visibility;
  takenDown: boolean;
  trackCount: number;
  coverUrl?: string;
  publishedAt?: string;
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
  takedownReason?: string;
  takenDownAt?: string;
  tracks: TrackRow[];
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
  trackCount: number;
  coverUrl?: string;
  updatedAt: string;
  groups?: string[];
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
export type Metric = "signups" | "artists" | "releases" | "plays";
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
