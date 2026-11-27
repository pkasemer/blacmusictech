// An in-memory stand-in for the Blac Music admin API, following admin-site-endpoint-requests.md.
// It lets the site be built and tested before the Backend session has shipped those endpoints.
// Local development only: sign in with admin@blac.test / mock-admin-pass.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";

export const MOCK_ADMIN_EMAIL = "admin@blac.test";
export const MOCK_ADMIN_PASSWORD = "mock-admin-pass";
export const MOCK_USER_EMAIL = "listener@blac.test";
export const MOCK_USER_PASSWORD = "mock-user-pass";

interface User {
  signalsExcluded?: boolean;
  id: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
  emailVerified: boolean;
  createdAt: string;
  ban: { at: string; reason: string; by: string } | null;
  methods: string[];
  lastSeenAt?: string;
}
interface Artist {
  avatarImageId?: string;
  /** given to its owner by an administrator (it returns to the catalog if the account goes) */
  received?: boolean;
  id: string;
  name: string;
  bio: string;
  ownerUserId?: string;
  verification: "unverified" | "pending" | "verified" | "rejected";
  verificationMessage: string;
  verificationNote: string;
  requestedAt?: string;
  flagged: boolean;
  ban: { at: string; reason: string; by: string } | null;
  followerCount: number;
  createdAt: string;
  quotaBytes: number;
  usedBytes: number;
  grants: { id: number; kind: string; bytes: number; note: string; createdAt: string }[];
}
interface Track {
  id: string;
  releaseId: string;
  title: string;
  trackNumber: number;
  durationMs: number;
  explicit: boolean;
  genre: string;
}
interface Release {
  coverImageId?: string;
  releaseDate?: string;
  publishAt?: string;
  id: string;
  artistId: string;
  title: string;
  type: "single" | "album";
  description: string;
  genre: string;
  visibility: "draft" | "scheduled" | "public";
  prevVisibility?: "draft" | "scheduled" | "public";
  takedown?: { at: string; reason: string };
  createdAt: string;
  publishedAt?: string;
}
interface Group {
  id: string;
  title: string;
  description: string;
  position: number;
  isActive: boolean;
  playlistIds: string[];
}
interface Playlist {
  coverImageId?: string;
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  isFeatured: boolean;
  trackIds: string[];
  updatedAt: string;
}
interface Audit {
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

export interface MockOptions {
  /** access token lifetime in seconds (tests use a short one) */
  accessTtl?: number;
  /** behave like a Backend that has not shipped POST /v1/admin/auth/login yet (404) */
  adminLoginMissing?: boolean | "unauthorized";
}

export interface Mock {
  server: Server;
  /** Requests the mock saw, newest last (for tests). */
  log: { method: string; path: string; xff?: string; auth?: string }[];
  state: { users: User[]; artists: Artist[]; releases: Release[]; tracks: Track[]; playlists: Playlist[]; audit: Audit[]; groups: Group[] };
  listen(port: number): Promise<number>;
  close(): Promise<void>;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const FIRST = ["Ayo", "Nia", "Kofi", "Zuri", "Tunde", "Amara", "Sade", "Jabari", "Imani", "Kwame", "Lola", "Dayo", "Efua", "Obi", "Femi", "Asha", "Kito", "Lulu", "Moses", "Zawadi"];
const LAST = ["Mensah", "Okafor", "Kamau", "Diallo", "Nkosi", "Adeyemi", "Traore", "Mwangi", "Bello", "Sow"];
const WORDS = ["Midnight", "Sunrise", "Kampala", "Lagos", "River", "Gold", "Echo", "Ocean", "Fire", "Rain", "Dust", "Drum", "Moon", "Street", "Home", "Dance", "Silver", "Wild"];
const GENRES = ["Afrobeats", "Hip-Hop", "R&B", "Gospel", "Amapiano", "Reggae"];

function seedData(now: number) {
  const r = rng(42);
  const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)] as T;
  const iso = (t: number) => new Date(t).toISOString();
  const users: User[] = [];
  users.push({ id: "usr_admin", email: MOCK_ADMIN_EMAIL, displayName: "Site Admin", role: "admin", emailVerified: true, createdAt: iso(now - 200 * DAY), ban: null, methods: ["password"], lastSeenAt: iso(now) });
  users.push({ id: "usr_listener", email: MOCK_USER_EMAIL, displayName: "Plain Listener", role: "user", emailVerified: true, createdAt: iso(now - 90 * DAY), ban: null, methods: ["password"] });
  for (let i = 0; i < 70; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const age = Math.floor(r() * 120);
    users.push({
      id: `usr_${String(i).padStart(4, "0")}`,
      email: `${name.toLowerCase().replace(/ /g, ".")}${i}@example.com`,
      displayName: name,
      role: "user",
      emailVerified: r() > 0.2,
      createdAt: iso(now - age * DAY - Math.floor(r() * DAY)),
      ban: i % 17 === 5 ? { at: iso(now - 3 * DAY), reason: "Spam uploads", by: "usr_admin" } : null,
      methods: r() > 0.6 ? ["google"] : r() > 0.8 ? ["apple"] : ["password"],
      lastSeenAt: iso(now - Math.floor(r() * 20) * DAY),
    });
  }
  const artists: Artist[] = [];
  const owners = users.slice(2, 22);
  owners.forEach((u, i) => {
    const v = (["verified", "verified", "pending", "unverified", "rejected", "pending"] as const)[i % 6]!;
    artists.push({
      id: `art_${String(i).padStart(3, "0")}`,
      name: u.displayName.split(" ")[0] + (i % 4 === 0 ? " Beats" : ""),
      bio: i % 3 === 0 ? "" : "Making music in the city. Booking: hello@example.com",
      ownerUserId: u.id,
      verification: v,
      verificationMessage: v === "pending" ? "I release on all major platforms; my Instagram is linked." : "",
      verificationNote: v === "rejected" ? "Could not confirm identity." : "",
      requestedAt: v === "pending" ? iso(now - (i + 1) * DAY) : undefined,
      flagged: i === 2,
      ban: i === 7 ? { at: iso(now - 5 * DAY), reason: "Copyright complaint", by: "usr_admin" } : null,
      followerCount: Math.floor(r() * 5000),
      createdAt: u.createdAt,
      quotaBytes: 10 * 1024 ** 3,
      usedBytes: Math.floor(r() * 4 * 1024 ** 3),
      grants: [{ id: i + 1, kind: "free", bytes: 10 * 1024 ** 3, note: "welcome allowance", createdAt: u.createdAt }],
    });
    if (i === 7) u.ban = { at: iso(now - 5 * DAY), reason: "Copyright complaint", by: "usr_admin" };
  });
  for (const a of artists) {
    const o = users.find((u) => u.id === a.ownerUserId);
    if (o?.ban && !a.ban) a.ban = o.ban;
  }
  for (let i = 0; i < 4; i++) {
    artists.push({
      id: `art_legacy${i}`, name: `${pick(WORDS)} ${pick(WORDS)} Crew`, bio: "Catalog artist.", verification: "unverified", verificationMessage: "", verificationNote: "",
      flagged: false, ban: null, followerCount: Math.floor(r() * 900), createdAt: iso(now - 150 * DAY), quotaBytes: 0, usedBytes: 0, grants: [],
    });
  }
  const releases: Release[] = [];
  const tracks: Track[] = [];
  artists.forEach((a, ai) => {
    const n = 1 + (ai % 3);
    for (let k = 0; k < n; k++) {
      const id = `alb_${a.id.slice(4)}_${k}`;
      const type = k === 0 && ai % 2 === 0 ? "single" : "album";
      const vis = (["public", "public", "draft", "scheduled", "public"] as const)[(ai + k) % 5]!;
      const created = new Date(a.createdAt).getTime() + (k + 1) * 3 * DAY;
      const rel: Release = {
        id, artistId: a.id, title: `${pick(WORDS)} ${pick(WORDS)}`, type, description: k % 2 ? "" : "Out now on Blac Music.",
        genre: pick(GENRES), visibility: vis, createdAt: iso(Math.min(created, now - DAY)),
        publishedAt: vis === "public" ? iso(Math.min(created + DAY, now - DAY)) : undefined,
      };
      if (ai === 9 && k === 0) {
        rel.prevVisibility = "public";
        rel.visibility = "draft";
        rel.takedown = { at: iso(now - 2 * DAY), reason: "Uncleared sample" };
      }
      releases.push(rel);
      const count = type === "single" ? 1 : 3 + Math.floor(r() * 5);
      for (let t = 0; t < count; t++) {
        tracks.push({ id: `trk_${id.slice(4).replace(/_/g, "")}x${t}`, releaseId: id, title: `${pick(WORDS)} ${pick(WORDS)}`, trackNumber: t + 1, durationMs: 120_000 + Math.floor(r() * 150_000), explicit: r() > 0.85, genre: rel.genre });
      }
    }
  });
  const pub = tracks.filter((t) => releases.find((x) => x.id === t.releaseId)?.visibility === "public");
  const playlists: Playlist[] = [
    { id: "pl_workout", name: "Workout Heat", description: "High energy for the gym.", isPublic: true, isFeatured: true, trackIds: pub.slice(0, 8).map((t) => t.id), updatedAt: iso(now - 2 * DAY) },
    { id: "pl_chill", name: "Late Night Chill", description: "Slow it down.", isPublic: true, isFeatured: true, trackIds: pub.slice(8, 14).map((t) => t.id), updatedAt: iso(now - 6 * DAY) },
    { id: "pl_new", name: "New This Week", description: "", isPublic: false, isFeatured: false, trackIds: pub.slice(14, 17).map((t) => t.id), updatedAt: iso(now - DAY) },
    { id: "pl_empty", name: "Gospel Sundays (draft)", description: "Work in progress.", isPublic: false, isFeatured: false, trackIds: [], updatedAt: iso(now - 12 * DAY) },
  ];
  const audit: Audit[] = [
    { id: 1, at: iso(now - 5 * DAY), actor: { id: "usr_admin", email: MOCK_ADMIN_EMAIL }, action: "artist.ban", targetType: "artist", targetId: "art_007", targetLabel: "Kofi Beats", reason: "Copyright complaint" },
    { id: 2, at: iso(now - 3 * DAY), actor: { id: "usr_admin", email: MOCK_ADMIN_EMAIL }, action: "user.ban", targetType: "user", targetId: "usr_0005", targetLabel: "spam@example.com", reason: "Spam uploads" },
  ];
  const groups: Group[] = [
    { id: "workout", title: "Workout", description: "Songs to move to.", position: 10, isActive: true, playlistIds: ["pl_workout", "pl_new"] },
    { id: "chill", title: "Chill", description: "Slow it down.", position: 20, isActive: true, playlistIds: ["pl_chill", "pl_workout"] },
    { id: "coming-soon", title: "Coming soon", description: "", position: 30, isActive: false, playlistIds: [] },
  ];
  audit.push({ id: 3, at: iso(now - 1.2 * DAY), actor: { id: "usr_admin", email: MOCK_ADMIN_EMAIL }, action: "import.create", targetType: "import", targetId: "imp_errors", targetLabel: "Import", reason: "", details: { keyName: "Catalogue loader", rightsBasis: "Permission from the artist, confirmed by the Blac Music team", tracks: 3 } });
  return { users, artists, releases, tracks, playlists, audit, groups };
}

import { checkLyrics, editable, type Lyrics } from "../src/lib/lyrics";

class HttpErr extends Error {
  constructor(public status: number, public code: string, message: string, public headers: Record<string, string> = {}) {
    super(message);
  }
}

export function createMock(opts: MockOptions = {}): Mock {
  const accessTtl = opts.accessTtl ?? 900;
  const now = Date.now();
  const state = seedData(now);
  let auditSeq = 100;
  const log: Mock["log"] = [];
  let listenPort = 0;
  const images = new Map<string, { owner: string; size: number; ready: boolean }>();
  const mediaUrl = (id: string, size = "medium") => `http://127.0.0.1:${listenPort}/v1/media/${id}/${size}.jpg`;

  const access = new Map<string, { userId: string; exp: number }>();
  const refresh = new Map<string, { userId: string; revoked: boolean }>();
  const fails = new Map<string, { n: number; reset: number }>();

  const issue = (userId: string) => {
    const a = randomBytes(24).toString("base64url");
    const rf = randomBytes(32).toString("base64url");
    const exp = Date.now() + accessTtl * 1000;
    access.set(a, { userId, exp });
    refresh.set(rf, { userId, revoked: false });
    return { accessToken: a, expiresAt: new Date(exp).toISOString(), refreshToken: rf };
  };
  const userOut = (u: User) => ({ id: u.id, email: u.email, displayName: u.displayName, role: u.role });

  const failHit = (key: string, limit: number): boolean => {
    const t = Date.now();
    const f = fails.get(key);
    return !!f && f.reset > t && f.n >= limit;
  };
  const failAdd = (key: string) => {
    const t = Date.now();
    const f = fails.get(key);
    if (!f || f.reset <= t) fails.set(key, { n: 1, reset: t + 15 * 60_000 });
    else f.n++;
  };

  const actorOf = (u: User) => ({ id: u.id, email: u.email });
  const addAudit = (actor: User, action: string, targetType: string, targetId: string, targetLabel: string, reason = "", details?: Record<string, unknown>) => {
    state.audit.push({ id: ++auditSeq, at: new Date().toISOString(), actor: actorOf(actor), action, targetType, targetId, targetLabel, reason, details });
  };

  const getUser = (id: string) => state.users.find((u) => u.id === id);
  const artistOfUser = (uid: string) => state.artists.find((a) => a.ownerUserId === uid);
  const releaseTracks = (rid: string) => state.tracks.filter((t) => t.releaseId === rid);
  const pageOf = <T,>(rows: T[], q: URLSearchParams) => {
    const limit = Math.min(Math.max(Number(q.get("limit")) || 25, 1), 200);
    const offset = Math.max(Number(q.get("offset")) || 0, 0);
    return { total: rows.length, rows: rows.slice(offset, offset + limit) };
  };
  const need = (cond: unknown, status: number, code: string, msg: string) => {
    if (!cond) throw new HttpErr(status, code, msg);
  };
  const reasonOf = (b: Record<string, unknown>): string => {
    const r = typeof b.reason === "string" ? b.reason.trim() : "";
    need(r.length >= 3 && r.length <= 500, 422, "validation_error", "reason must be 3-500 characters");
    return r;
  };

  const artistRow = (a: Artist) => {
    const owner = a.ownerUserId ? getUser(a.ownerUserId) : undefined;
    return {
      imageUrl: a.avatarImageId ? mediaUrl(a.avatarImageId) : undefined,
      id: a.id, name: a.name, verification: a.verification, flagged: a.flagged, banned: !!a.ban || !!owner?.ban,
      ownerUserId: a.ownerUserId, ownerEmail: owner?.email,
      releaseCount: state.releases.filter((r) => r.artistId === a.id).length, followerCount: a.followerCount, createdAt: a.createdAt,
      verificationMessage: a.verificationMessage || undefined, requestedAt: a.requestedAt,
    };
  };
  const artistStorage = (a: Artist) => {
    const MB = 1024 * 1024;
    const rels = state.releases.filter((r) => r.artistId === a.id);
    const count = (pub: boolean) => rels.filter((r) => (r.visibility === "public") === pub).reduce((s, r) => s + state.tracks.filter((t) => t.releaseId === r.id).length, 0);
    const published = count(true);
    const unpublished = count(false);
    const audio = (files: number) => ({ files, bytes: files * 7 * MB });
    const pictures = (a.avatarImageId ? 1 : 0) + rels.filter((r) => r.coverImageId).length;
    const all = (published + unpublished) * 7 * MB;
    return {
      usedBytes: a.received ? 0 : all,
      ...(a.received ? { teamUploadBytes: all } : {}),
      quotaBytes: a.ownerUserId ? a.quotaBytes : 0,
      breakdown: { publishedAudio: audio(published), unpublishedAudio: audio(unpublished), unfinishedUploads: audio(0), playbackAudio: { files: (published + unpublished) * 3, bytes: (published + unpublished) * 4 * MB }, pictures: { files: pictures, bytes: pictures * MB } },
    };
  };
  interface Stuck { uploadId: string; title: string; state: "stuck" | "working" | "waiting" | "failed" | "ready"; attempts: number; since: number; error: string; fileKept: boolean; onTransfer: boolean; imported: boolean }
  const stuckList: Stuck[] = [
    { uploadId: "up_stuck", title: "Nile Morning", state: "stuck", attempts: 1, since: now - 14 * 60_000, error: "", fileKept: true, onTransfer: false, imported: true },
    { uploadId: "up_working", title: "Long Concert Take", state: "working", attempts: 1, since: now - 6 * 60_000, error: "", fileKept: true, onTransfer: false, imported: false },
    { uploadId: "up_waiting", title: "Evening Song", state: "waiting", attempts: 0, since: now - 90_000, error: "", fileKept: true, onTransfer: false, imported: false },
    { uploadId: "up_held", title: "Channel Upload", state: "waiting", attempts: 0, since: now - 300_000, error: "", fileKept: true, onTransfer: true, imported: false },
    { uploadId: "up_failed_kept", title: "Drum Intro", state: "failed", attempts: 3, since: now - 3600_000, error: "processing did not finish, please upload again", fileKept: true, onTransfer: false, imported: false },
    { uploadId: "up_failed_gone", title: "Broken File", state: "failed", attempts: 1, since: now - 86_400_000, error: "the file could not be read as audio", fileKept: false, onTransfer: false, imported: false },
  ];
  const processingRow = (u: Stuck) => {
    const rel = state.releases[0]!;
    const art = state.artists.find((a) => a.id === rel.artistId)!;
    const at = new Date(u.since).toISOString();
    return {
      uploadId: u.uploadId, title: u.title, artistId: art.id, artistName: art.name, releaseId: rel.id, releaseTitle: rel.title,
      status: u.state === "waiting" ? "queued" : u.state === "failed" ? "failed" : "processing", state: u.state, attempts: u.attempts, sizeBytes: 6_900_000, createdAt: at, updatedAt: at,
      startedAt: u.state === "stuck" || u.state === "working" ? at : null, lastSignalAt: u.state === "stuck" ? at : u.state === "working" ? new Date().toISOString() : null,
      waitingOnTransfer: u.onTransfer, import: u.imported ? { jobId: "imp_running", artistName: art.name } : null, error: u.error,
      canRetry: u.state === "stuck" || (u.state === "failed" && u.fileKept), canForce: u.state === "working",
    };
  };
  const featured: string[] = [];
  const lyrics = new Map<string, Lyrics>();
  // things waiting: a new release, a change to a live one, and (added below) a new artist profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose sample data
  const reviews: any[] = state.releases.slice(0, 2).map((rel, i) => ({
    subject: "release",
    id: "rev_mock" + (i + 1), releaseId: rel.id, title: rel.title, type: rel.type, kind: (i === 0 ? "new" : "update") as "new" | "update", status: "pending", revision: 1,
    artist: { id: rel.artistId, name: state.artists.find((a) => a.id === rel.artistId)?.name ?? "Artist" }, submittedAt: new Date(Date.now() - (i === 0 ? 3 : 1) * 3600_000).toISOString(),
    publishAt: null as string | null, decidedAt: null as string | null, reason: "", changes: i === 0 ? null : ["Title", "Lyrics"],
    detail: {
      decidedBy: null as { id: string; email: string } | null,
      release: { description: "", genre: "Afrobeats", releaseDate: null, visibility: i === 0 ? "draft" : "public" },
      tracks: state.tracks.filter((t) => t.releaseId === rel.id).map((t, k) => ({ trackId: t.id, title: t.title, trackNumber: k + 1, durationMs: t.durationMs, explicit: false, genre: "Afrobeats", featuredArtists: [] as string[], lyrics: null })),
      credits: [{ name: "A Producer", role: "producer" }],
      changeItems: i === 0 ? [] : [
        { kind: "release", label: "Title", field: "title", approved: rel.title, proposed: rel.title + " (Remix)" },
        { kind: "lyrics", label: "Lyrics", approved: null, proposed: { synced: true, text: "Hello", lines: [{ timeMs: 1000, text: "Hello", translation: "Hi" }] } },
      ],
    },
  }));
  type Guest = { creditId: string; releaseId: string; trackId: string; artistId?: string; name: string; addedByTeam: boolean };
  const guests: Guest[] = [];
  const releaseProgress = (r: Release) => {
    const views = releaseTracks(r.id).map(metaView);
    const n = (f: (s: string) => boolean) => views.filter((v) => f(v.status)).length;
    const enriched = n((s) => s !== "not_started");
    const verified = n((s) => s === "verified");
    return { total: views.length, enriched, pendingReview: n((s) => s === "pending_review"), verified, status: views.length > 0 && verified === views.length ? "completed" : enriched === 0 ? "not_started" : "in_progress" };
  };
  const term = (id: string, label: string, active = true) => ({ id, label, active });
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const terms = (names: string[]) => names.map((n) => term(slug(n), n));
  const lang = (groupId: string, names: string[]) => terms(names).map((t) => ({ ...t, groupId }));
  const taxonomy = {
    requiredFields: ["language"],
    languageGroups: [{ id: "runyakitara", label: "Runyakitara" }, { id: "central_eastern_bantu", label: "Central and Eastern Bantu" }, { id: "luo", label: "Luo / Lwo" }, { id: "ateker", label: "Ateker" }, { id: "moru_madi", label: "Moru–Ma'di" }, { id: "national_international", label: "National and International" }],
    languages: [...lang("runyakitara", ["Runyankole", "Rukiga", "Runyoro", "Rutooro"]), ...lang("central_eastern_bantu", ["Luganda", "Lussese", "Lusoga", "Lugwere", "Luruuli"]), ...lang("luo", ["Acholi", "Lango", "Alur", "Kumam", "Adhola"]), ...lang("ateker", ["Ateso", "Ngakarimojong", "Jie", "Dodoth", "Pokot"]), ...lang("moru_madi", ["Lugbara", "Aringa", "Madi"]), ...lang("national_international", ["English", "Swahili"])],
    cultures: terms(["Acholi", "Lango", "Baganda", "Basoga", "Banyankole", "Bakiga", "Banyoro", "Batooro", "Iteso", "Karamojong", "Alur", "Lugbara", "Madi"]),
    regions: terms(["Central", "Eastern", "Northern", "Western", "Karamoja", "West Nile"]),
    genres: [...terms(["Afrobeats", "Afropop", "Hip-Hop", "R&B", "Dancehall", "Gospel", "Traditional", "Kadongo Kamu", "Reggae", "Amapiano"]).map((t) => ({ ...t, parentId: null as string | null })), { ...term("old_style", "Old Style", false), parentId: null }],
    attributes: { mood: terms(["Happy", "Sad", "Romantic", "Energetic", "Inspirational", "Spiritual", "Relaxed", "Aggressive", "Nostalgic"]), energy: terms(["Low", "Medium", "High"]).map((t) => ({ ...t, id: "energy_" + t.id })), danceability: terms(["Low", "Medium", "High"]).map((t) => ({ ...t, id: "dance_" + t.id })), instrumentation: terms(["Acoustic", "Electronic", "Percussion", "Guitar", "Piano", "Traditional Instruments", "Brass", "Strings"]) },
  };
  type MetaLink = { id: string; role?: string; primary?: boolean; source: string; verification: string; confidence: number | null; verifiedBy: { id: string; email: string } | null; verifiedAt: string | null };
  interface Meta { languageUnknown: boolean; languages: MetaLink[]; cultures: MetaLink[]; regions: MetaLink[]; genres: MetaLink[]; attributes: Record<string, MetaLink[]>; version: number; touched: boolean; updatedAt: string | null; updatedBy: { id: string; email: string } | null; submittedAt?: string | null; unknownReview?: MetaLink | null; reviewNote?: string }
  const metas = new Map<string, Meta>();
  const fresh = (source: string, id: string): MetaLink => ({ id, source, verification: "pending", confidence: null, verifiedBy: null, verifiedAt: null });
  const metaOf = (t: Track) => {
    let m = metas.get(t.id);
    if (!m) {
      const g = taxonomy.genres.find((x) => x.label === t.genre);
      m = { languageUnknown: false, languages: [], cultures: [], regions: [], genres: g ? [{ ...fresh("imported", g.id), primary: true }] : [], attributes: { mood: [], energy: [], danceability: [], instrumentation: [] }, version: 1, touched: false, updatedAt: null, updatedBy: null };
      metas.set(t.id, m);
    }
    return m;
  };
  const metaView = (t: Track) => {
    const m = metaOf(t);
    const rel = state.releases.find((r) => r.id === t.releaseId)!;
    const art = state.artists.find((a) => a.id === rel.artistId)!;
    const entered = m.touched && (m.languageUnknown || [m.languages, m.cultures, m.regions, m.genres, ...Object.values(m.attributes)].some((l) => l.some((x) => x.source !== "imported")));
    return {
      trackId: t.id, title: t.title, trackNumber: t.trackNumber ?? null, durationMs: t.durationMs, artist: { id: art.id, name: art.name }, featuredArtists: [], release: { id: rel.id, title: rel.title, type: rel.type, releaseDate: rel.releaseDate ?? null }, isrc: null,
      ...(() => {
        const live = (l: MetaLink[]) => l.filter((x) => x.verification !== "rejected");
        const unknownOk = m.languageUnknown && m.unknownReview?.verification !== "rejected";
        const missing = unknownOk || live(m.languages).length > 0 ? [] : ["language"];
        const required = [...live(m.languages), ...(m.languageUnknown && m.unknownReview ? [m.unknownReview] : [])];
        const verified = missing.length === 0 && required.every((x) => x.verification === "verified");
        return { status: !entered ? "not_started" : verified ? "verified" : missing.length === 0 ? "pending_review" : "in_progress", missingRequired: missing };
      })(),
      submittedAt: m.submittedAt ?? null, submittedBy: null, languageUnknownReview: m.languageUnknown ? (m.unknownReview ?? null) : null, reviewNote: m.reviewNote ?? "",
      languageUnknown: m.languageUnknown, languages: m.languages, cultures: m.cultures, regions: m.regions, genres: m.genres, attributes: m.attributes, version: "v" + m.version, updatedAt: m.updatedAt, updatedBy: m.updatedBy,
    };
  };
  const releaseRow = (r: Release) => {
    const a = state.artists.find((x) => x.id === r.artistId);
    return {
      id: r.id, releaseDate: r.releaseDate ?? null, metadata: releaseProgress(r), featured: featured.includes(r.id), title: r.title, type: r.type, kind: r.type === "single" ? "single" : releaseTracks(r.id).length <= 6 ? "ep" : "album", artistId: r.artistId, artistName: a?.name ?? "", visibility: r.visibility, takenDown: !!r.takedown,
      previousVisibility: r.takedown ? r.prevVisibility : undefined, coverUrl: r.coverImageId ? mediaUrl(r.coverImageId) : undefined, trackCount: releaseTracks(r.id).length, publishedAt: r.publishedAt ?? null, createdAt: r.createdAt,
    };
  };
  const trackPublic = (t: Track) => {
    const rel = state.releases.find((r) => r.id === t.releaseId);
    return rel?.visibility === "public";
  };
  const playlistRow = (p: Playlist) => ({
    id: p.id, name: p.name, description: p.description, isPublic: p.isPublic, isFeatured: p.isFeatured, trackCount: p.trackIds.length, updatedAt: p.updatedAt,
    published: p.isPublic && p.isFeatured, playableTrackCount: p.trackIds.filter((id) => { const t = state.tracks.find((x) => x.id === id); return t && trackPublic(t); }).length,
    coverUrl: p.coverImageId ? mediaUrl(p.coverImageId) : undefined,
    groups: state.groups.filter((g) => g.playlistIds.includes(p.id)).map((g) => ({ id: g.id, title: g.title })),
  });
  const playlistItems = (p: Playlist) =>
    p.trackIds.map((tid, i) => {
      const t = state.tracks.find((x) => x.id === tid);
      const rel = t && state.releases.find((r) => r.id === t.releaseId);
      const art = rel && state.artists.find((a) => a.id === rel.artistId);
      return { itemId: `${p.id}:${i}`, trackId: tid, title: t?.title ?? "(deleted)", artistName: art?.name ?? "", durationMs: t?.durationMs ?? 0, position: i, public: t ? trackPublic(t) : false };
    });

  // Plays per day, derived from a seeded generator so charts look alive and stay stable.
  const dayCount = (metric: string, dayStart: number): number => {
    const t0 = dayStart;
    if (metric === "searches" || metric === "searches_no_results") {
      const rr = rng(Math.floor(t0 / DAY) + 99);
      const total = Math.floor(900 + rr() * 500 + (Math.floor(t0 / DAY) % 7 >= 5 ? 300 : 0));
      return metric === "searches" ? total : Math.floor(total * (0.08 + rr() * 0.05));
    }
    if (metric === "plays") {
      const rr = rng(Math.floor(t0 / DAY));
      return Math.floor(300 + rr() * 500 + (Math.floor(t0 / DAY) % 7 >= 5 ? 250 : 0));
    }
    const inDay = (iso?: string) => !!iso && new Date(iso).getTime() >= t0 && new Date(iso).getTime() < t0 + DAY;
    if (metric === "signups") return state.users.filter((u) => inDay(u.createdAt)).length;
    if (metric === "artists") return state.artists.filter((a) => inDay(a.createdAt)).length;
    return state.releases.filter((r) => inDay(r.createdAt)).length;
  };
  const utcDay = (t: number) => Math.floor(t / DAY) * DAY;

  // ---- audio uploads: parts arrive at /mock-storage/up/{id}/{n}; after complete a "worker" makes the track ~1.5 s later
  interface Upload {
    id: string; releaseId: string; title: string; genre: string; trackNumber?: number; explicit: boolean; filename: string; sizeBytes: number;
    status: "pending" | "queued" | "processing" | "ready" | "failed"; partSize: number; partCount: number; multipart: boolean;
    got: Map<number, number>; readyAt?: number; trackId?: string; error?: string;
  }
  const uploads = new Map<string, Upload>();
  const PART = 8 * 1024 * 1024;
  const settle = () => {
    const now2 = Date.now();
    for (const u of uploads.values()) {
      if (u.status === "queued" && u.readyAt && now2 >= u.readyAt - 700) u.status = "processing";
      if ((u.status === "queued" || u.status === "processing") && u.readyAt && now2 >= u.readyAt) {
        if (u.filename.toLowerCase().includes("broken")) {
          u.status = "failed";
          u.error = "the file could not be read as audio";
          continue;
        }
        const n = releaseTracks(u.releaseId).length;
        const tr: Track = { id: "trk_" + randomBytes(10).toString("hex"), releaseId: u.releaseId, title: u.title, trackNumber: u.trackNumber ?? n + 1, durationMs: 150_000 + (u.sizeBytes % 90_000), explicit: u.explicit, genre: u.genre };
        state.tracks.push(tr);
        u.trackId = tr.id;
        u.status = "ready";
      }
    }
  };
  const uploadView = (u: Upload) => ({ id: u.id, status: u.status, releaseId: u.releaseId, title: u.title, genre: u.genre || undefined, trackNumber: u.trackNumber, explicit: u.explicit, filename: u.filename, sizeBytes: u.sizeBytes, partSize: u.multipart ? u.partSize : undefined, partCount: u.multipart ? u.partCount : undefined, trackId: u.trackId, error: u.error });
  // uploads that are not (yet) tracks, for the release page
  const uploadsOf = (rid: string) => { settle(); return [...uploads.values()].filter((u) => u.releaseId === rid && u.status !== "ready").map(uploadView); };
  const partTargets = (u: Upload, only?: number[]) => Array.from({ length: u.partCount }, (_, i) => i + 1).filter((n) => !only || only.includes(n)).map((n) => ({ number: n, url: `http://127.0.0.1:${listenPort}/mock-storage/up/${u.id}/${n}` }));
  const partSizeOf = (u: Upload, n: number) => (n === u.partCount ? u.sizeBytes - u.partSize * (u.partCount - 1) : u.partSize);

  // ---- import keys and bulk import runs
  interface Key { id: string; name: string; prefix: string; createdBy: string; createdAt: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null }
  const day = (d: number) => new Date(now + d * DAY).toISOString();
  const keys: Key[] = [
    { id: "key_active", name: "Catalogue loader", prefix: "blac_imp_Qx7pLm", createdBy: MOCK_ADMIN_EMAIL, createdAt: day(-3), expiresAt: day(27), revokedAt: null, lastUsedAt: day(-0.05) },
    { id: "key_old", name: "October test", prefix: "blac_imp_a91kTz", createdBy: MOCK_ADMIN_EMAIL, createdAt: day(-40), expiresAt: day(-10), revokedAt: null, lastUsedAt: day(-12) },
    { id: "key_gone", name: "Shared with partner", prefix: "blac_imp_Mm20Pd", createdBy: MOCK_ADMIN_EMAIL, createdAt: day(-20), expiresAt: day(60), revokedAt: day(-2), lastUsedAt: null },
  ];
  interface Job {
    jobId: string; status: "pending" | "processing" | "completed" | "completed_with_errors" | "failed" | "cancelled"; artist: string; artistId?: string; type: "single" | "album"; visibility: "draft" | "public";
    titles: string[]; failTitles: string[]; skipTitles: string[]; createdAt: string; startedAt: string | null; finishedAt: string | null; doneAtStart: number;
    /** started, but earlier imports are being served */
    behind?: boolean;
  }
  const someArtist = state.artists[0]!;
  const someRelease = state.releases[0]!;
  const jobs: Job[] = [
    { jobId: "imp_running", status: "processing", artist: "Judas Rapkwonledge", artistId: someArtist.id, type: "single", visibility: "draft", titles: Array.from({ length: 12 }, (_, i) => `Track ${i + 1}`), failTitles: [], skipTitles: ["Track 2"], createdAt: day(-0.02), startedAt: day(-0.015), finishedAt: null, doneAtStart: 4 },
    { jobId: "imp_next", status: "processing", behind: true, artist: "Amara", type: "single", visibility: "public", titles: ["Sunrise", "Market Day", "Long Road"], failTitles: [], skipTitles: [], createdAt: day(-0.019), startedAt: day(-0.012), finishedAt: null, doneAtStart: 0 },
    { jobId: "imp_later", status: "processing", behind: true, artist: "Obi", type: "album", visibility: "draft", titles: Array.from({ length: 9 }, (_, i) => `Part ${i + 1}`), failTitles: [], skipTitles: [], createdAt: day(-0.018), startedAt: day(-0.011), finishedAt: null, doneAtStart: 0 },
    { jobId: "imp_errors", status: "completed_with_errors", artist: someArtist.name, artistId: someArtist.id, type: "single", visibility: "public", titles: ["Example Song", "Other Song", "Third Song"], failTitles: ["Other Song"], skipTitles: ["Third Song"], createdAt: day(-1.2), startedAt: day(-1.19), finishedAt: day(-1.18), doneAtStart: 3 },
    { jobId: "imp_waiting", status: "pending", artist: "New Band", type: "album", visibility: "draft", titles: ["One", "Two"], failTitles: [], skipTitles: [], createdAt: day(-0.2), startedAt: null, finishedAt: null, doneAtStart: 0 },
    { jobId: "imp_old", status: "completed", artist: someArtist.name, artistId: someArtist.id, type: "album", visibility: "draft", titles: ["A", "B", "C", "D"], failTitles: [], skipTitles: [], createdAt: day(-9), startedAt: day(-9), finishedAt: day(-8.99), doneAtStart: 4 },
  ];
  const jobView = (j: Job, full: boolean) => {
    // a running job finishes one more track every few seconds
    const done = j.behind ? 0 : j.status === "processing" ? Math.min(j.titles.length, j.doneAtStart + Math.floor((Date.now() - now) / 4000)) : j.status === "pending" || j.status === "cancelled" ? 0 : j.titles.length;
    const rows = j.titles.map((title, i) => {
      let status: string = i < done ? "created" : j.status === "processing" && !j.behind && (i === done || i === done + 1) ? "processing" : "waiting";
      if (status === "created" && j.failTitles.includes(title)) status = "failed";
      if (status === "created" && j.skipTitles.includes(title)) status = "skippedDuplicate";
      return { title, status, releaseId: status === "created" || status === "skippedDuplicate" ? someRelease.id : undefined, duration: status === "created" ? "3:05" : undefined, durationSeconds: status === "created" ? 185 : undefined };
    });
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    const finished = j.status === "processing" && done === j.titles.length;
    const status = finished ? (count("failed") ? "completed_with_errors" : "completed") : j.status;
    return {
      jobId: j.jobId, status, artist: j.artist, artistId: j.artistId, type: j.type, visibility: j.visibility, totalTracks: j.titles.length,
      created: count("created"), skippedDuplicate: count("skippedDuplicate"), failed: count("failed"), remaining: count("waiting") + count("processing"),
      bytesStored: count("created") * 6_900_000, createdAt: j.createdAt, startedAt: j.startedAt, finishedAt: finished ? new Date().toISOString() : j.finishedAt,
      results: full ? rows : undefined,
      errors: full ? rows.filter((r) => r.status === "failed").map((r) => ({ title: r.title, file: "07.mp3", code: "corrupt_audio", message: "could not read this file as audio" })) : null,
      warnings: full && j.jobId === "imp_errors" ? ["The artist picture could not be used."] : undefined,
    };
  };

  const blocks: { id: number; kind: "track" | "artist"; targetId: string; name: string; artistName: string; songs: number; reason: string; blockedBy: { id: string; email: string }; blockedAt: string }[] = [];

  const routes = (req: IncomingMessage, url: URL, body: Record<string, unknown>, actor: User): { status: number; data?: unknown } => {
    const m = req.method ?? "GET";
    const p = url.pathname.replace(/^\/v1\/admin/, "");
    const q = url.searchParams;
    let mt: RegExpMatchArray | null;
    const ok = (data: unknown, status = 200) => ({ status, data });
    const none = { status: 204 } as const;

    // ------------------------------------------------------------ song processing: stuck songs and retry
    if (m === "GET" && p === "/processing") {
      const live = stuckList.filter((u) => u.state !== "ready");
      const rank = { stuck: 0, working: 1, waiting: 2, failed: 3 } as Record<string, number>;
      const uploadsNow = [...live].sort((a, b) => rank[a.state]! - rank[b.state]!).map(processingRow);
      const n = (st: string) => live.filter((u) => u.state === st).length;
      return ok({ measuredAt: new Date().toISOString(), stuckAfterSeconds: 180, workerLastSeenAt: new Date(Date.now() - 2 * 60_000).toISOString(), counts: { stuck: n("stuck"), working: n("working"), waiting: n("waiting"), failed: n("failed") }, uploads: uploadsNow });
    }
    if ((mt = p.match(/^\/processing\/([^/]+)\/retry$/)) && m === "POST") {
      const u = stuckList.find((x) => x.uploadId === mt![1]);
      need(u, 404, "not_found", "upload not found");
      need(u!.state !== "waiting", 409, "already_queued", "it is already in the queue");
      need(u!.state !== "ready", 409, "not_stuck", "it has finished");
      need(u!.state !== "working" || body.force === true, 409, "still_processing", "it is being worked on");
      need(u!.state !== "failed" || u!.fileKept, 409, "file_gone", "the file was deleted: upload it again");
      const was = u!.state;
      u!.state = "waiting";
      u!.attempts = 0;
      u!.error = "";
      u!.since = Date.now();
      addAudit(actor, "upload.retry", "upload", u!.uploadId, u!.title, "", { was });
      return ok(processingRow(u!));
    }

    // ------------------------------------------------------------ server (storage and load), read only
    if (m === "GET" && p === "/system") {
      const GB = 1024 ** 3;
      const usage = (totalBytes: number, usedBytes: number) => ({ totalBytes, usedBytes, freeBytes: totalBytes - usedBytes, usedPercent: Math.round((usedBytes / totalBytes) * 1000) / 10 });
      const byKind = { audioOriginals: { objects: 1240, bytes: 21 * GB }, audioPlayback: { objects: 3720, bytes: 11 * GB }, images: { objects: 890, bytes: 1.5 * GB }, other: { objects: 6, bytes: 0.2 * GB } };
      const objectBytes = Object.values(byKind).reduce((s, k) => s + k.bytes, 0);
      const databaseBytes = 0.6 * GB;
      const diskUsed = 66 * GB;
      const measured = new Date().toISOString();
      return ok({
        measuredAt: measured,
        server: { cpuCount: 2, load: { "1m": 0.9, "5m": 1.1, "15m": 1.04 }, uptimeSeconds: 12 * 86_400 + 5 * 3600, memory: usage(4 * GB, 2.3 * GB), swap: usage(2 * GB, 0.1 * GB), disk: usage(80 * GB, diskUsed) },
        storage: { measuredAt: new Date(Date.now() - 25 * 60_000).toISOString(), objects: Object.values(byKind).reduce((s, k) => s + k.objects, 0), objectBytes, byKind, databaseBytes, otherBytes: diskUsed - objectBytes - databaseBytes },
        topArtists: state.artists.slice(0, 6).map((a, i) => ({ artistId: a.id, name: a.name, tracks: 40 - i * 6, bytes: Math.round((7.5 - i) * GB) })),
        work: { uploads: { pending: 1, queued: 3, processing: 1, stuck: stuckList.filter((u) => u.state === "stuck").length, failedLast24h: 2, oldestQueuedSeconds: 340 }, imports: { awaitingFiles: 1, processing: 1 }, emails: { waiting: 0, failedLast24h: 0 }, push: { waiting: 4, failedLast24h: 0 } },
        lastSampleAt: new Date(Date.now() - 3 * 60_000).toISOString(),
        alerts: [
          { level: "warning", code: "disk_low", message: "The disk is 82.5% full." },
          ...(stuckList.some((u) => u.state === "stuck") ? [{ level: "warning", code: "upload_stuck", message: "A song is stuck in processing." }] : []),
        ],
      });
    }
    if (m === "GET" && p === "/system/history") {
      const hours = q.get("hours") === null ? 24 : Number(q.get("hours"));
      need(Number.isInteger(hours) && hours >= 1 && hours <= 720, 422, "validation_error", "hours must be 1-720");
      const stepSeconds = Math.max(300, Math.ceil((hours * 3600) / 300 / 300) * 300);
      const step = stepSeconds * 1000;
      const last = Math.floor(Date.now() / step) * step;
      const n = Math.floor((hours * 3600_000) / step);
      const points = [];
      for (let i = n - 1; i >= 0; i--) {
        if (i > n * 0.35 && i < n * 0.45) continue; // the worker was down for a while
        const rr = rng(Math.floor((last - i * step) / step));
        const diskUsedBytes = Math.round((66 - i * (stepSeconds / 86_400) * 0.3) * 1024 ** 3);
        points.push({ at: new Date(last - i * step).toISOString(), load: Math.round((0.5 + rr() * 1.4) * 100) / 100, memoryUsedPercent: Math.round((50 + rr() * 15) * 10) / 10, diskUsedBytes, diskFreeBytes: 80 * 1024 ** 3 - diskUsedBytes, uploadsWaiting: rr() > 0.85 ? Math.floor(rr() * 6) : 0 });
      }
      return ok({ hours, stepSeconds, points });
    }

    // ------------------------------------------------------------ stats
    if (m === "GET" && p === "/stats/overview") {
      const t = Date.now();
      const since = (d: number) => state.users.filter((u) => new Date(u.createdAt).getTime() > t - d * DAY).length;
      let plays7 = 0, plays30 = 0;
      for (let i = 0; i < 30; i++) {
        const c = dayCount("plays", utcDay(t - i * DAY));
        plays30 += c;
        if (i < 7) plays7 += c;
      }
      return ok({
        users: { total: state.users.length, verifiedEmail: state.users.filter((u) => u.emailVerified).length, banned: state.users.filter((u) => u.ban).length, new7d: since(7), new30d: since(30) },
        artists: { total: state.artists.length, verified: state.artists.filter((a) => a.verification === "verified").length, pendingVerification: state.artists.filter((a) => a.verification === "pending").length, banned: state.artists.filter((a) => a.ban).length },
        releases: { total: state.releases.length, public: state.releases.filter((r) => r.visibility === "public").length, draft: state.releases.filter((r) => r.visibility === "draft" && !r.takedown).length, scheduled: state.releases.filter((r) => r.visibility === "scheduled").length, takenDown: state.releases.filter((r) => r.takedown).length },
        tracks: { total: state.tracks.length },
        shows: { total: 12 },
        plays: { total: plays30 * 5, last7d: plays7, last30d: plays30, uniqueListeners30d: Math.floor(plays30 / 6) },
        storageBytes: state.artists.reduce((s, a) => s + a.usedBytes, 0),
      });
    }
    if (m === "GET" && p === "/stats/timeseries") {
      const metric = q.get("metric") ?? "";
      need(["signups", "artists", "releases", "plays", "searches", "searches_no_results"].includes(metric), 400, "bad_request", "unknown metric");
      const from = utcDay(Date.parse(q.get("from") ?? "") || Date.now() - 29 * DAY);
      const to = utcDay(Date.parse(q.get("to") ?? "") || Date.now());
      need(to >= from && (to - from) / DAY <= 366, 400, "bad_request", "range must be 1-366 days");
      const week = q.get("bucket") === "week";
      const points: { date: string; count: number }[] = [];
      for (let d = from; d <= to; d += week ? 7 * DAY : DAY) {
        let c = 0;
        for (let k = 0; k < (week ? 7 : 1); k++) if (d + k * DAY <= to) c += dayCount(metric, d + k * DAY);
        points.push({ date: new Date(d).toISOString().slice(0, 10), count: c });
      }
      return ok({ points });
    }
    if (m === "GET" && p === "/stats/top") {
      const kind = q.get("kind");
      need(kind === "artists" || kind === "tracks", 400, "bad_request", "kind must be artists or tracks");
      const lim = Math.min(Number(q.get("limit")) || 10, 50);
      const rr = rng(kind === "artists" ? 7 : 9);
      const base = kind === "artists" ? state.artists.map((a) => ({ id: a.id, name: a.name })) : state.tracks.map((t) => ({ id: t.id, name: t.title }));
      const items = base.map((x) => ({ ...x, plays: Math.floor(rr() * 9000) })).sort((a, b) => b.plays - a.plays).slice(0, lim);
      return ok({ items });
    }

    // ------------------------------------------------------------ users
    if (m === "GET" && p === "/users") {
      const term = (q.get("q") ?? "").toLowerCase();
      let rows = state.users.filter((u) => !term || u.email.toLowerCase().includes(term) || u.displayName.toLowerCase().includes(term));
      const role = q.get("role");
      if (role) rows = rows.filter((u) => u.role === role);
      const st = q.get("status");
      if (st === "banned") rows = rows.filter((u) => u.ban);
      if (st === "active") rows = rows.filter((u) => !u.ban);
      if (st === "unverified") rows = rows.filter((u) => !u.emailVerified);
      rows = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const pg = pageOf(rows, q);
      return ok({ total: pg.total, users: pg.rows.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName, role: u.role, emailVerified: u.emailVerified, banned: !!u.ban, hasArtist: !!artistOfUser(u.id), createdAt: u.createdAt })) });
    }
    // ------------------------------------------------------------ keeping songs and artists out of suggestions
    if (p === "/recommendations/blocks" && m === "GET") return ok({ blocks });
    if (p === "/recommendations/blocks" && m === "POST") {
      const trackId = String(body.trackId ?? "");
      const artistId = String(body.artistId ?? "");
      const why = String(body.reason ?? "").trim();
      need((trackId === "") !== (artistId === ""), 422, "validation_error", "send trackId or artistId, one of them");
      need(why.length >= 3, 422, "validation_error", "reason must be 3 to 500 characters");
      const track = state.tracks.find((t) => t.id === trackId);
      const artist = state.artists.find((a) => a.id === artistId);
      need(track || artist, 404, "not_found", "not found");
      const target = trackId || artistId;
      need(!blocks.some((b) => b.targetId === target), 409, "already_blocked", "it is already blocked");
      const id = (blocks[0]?.id ?? 0) + 1;
      blocks.unshift({ id, kind: trackId ? "track" : "artist", targetId: target, name: track?.title ?? artist!.name, artistName: trackId ? "Mock Artist" : "", songs: trackId ? 1 : 4, reason: why, blockedBy: { id: actor.id, email: actor.email }, blockedAt: new Date().toISOString() });
      return ok({ id, removedFromPlaylists: trackId ? 1 : 0 }, 201);
    }
    if ((mt = p.match(/^\/recommendations\/blocks\/(\d+)$/)) && m === "DELETE") {
      const at = blocks.findIndex((b) => b.id === Number(mt![1]));
      need(at >= 0, 404, "not_found", "not found");
      blocks.splice(at, 1);
      return none;
    }
    // ------------------------------------------------------------ the recommendation engine's reports
    if (m === "GET" && p === "/recommendations/readiness") {
      const playable = state.tracks.length;
      const has = (key: "languages" | "cultures" | "regions") => state.tracks.filter((x) => metaOf(x)[key].some((l) => l.verification === "verified")).length;
      return ok({
        algorithm: "hybrid-1",
        songs: { playable, withGenre: state.tracks.filter((x) => metaOf(x).genres.length > 0).length, withVerifiedLanguage: has("languages"), withVerifiedRegion: has("regions"), withVerifiedCulture: has("cultures"), withVerifiedSound: 0 },
        listeners: { counted: state.users.length - 1, withChoices: 5, heardTenSongs: 2, leftOut: state.users.filter((u) => u.role === "admin" || u.signalsExcluded).length },
      });
    }
    if (m === "GET" && p === "/recommendations/outcomes") {
      const days = Math.min(Number(q.get("days") ?? 14) || 14, 90);
      const row = (surface: string, slot: string, suggested: number, listened: number, completed: number, skipped: number, kept: number) => ({ surface, algorithm: "hybrid-1", slot, suggested, listened, completed, skipped, kept, listeners: 3 });
      return ok({ days, rows: days <= 7 ? [] : [row("mix", "discovery", 42, 9, 5, 3, 1), row("mix", "familiar", 110, 48, 36, 8, 6), row("your_sound", "familiar", 40, 22, 17, 3, 4)] });
    }
    if ((mt = p.match(/^\/users\/([^/]+)\/recommendations$/)) && m === "GET") {
      const u = getUser(mt[1]!);
      need(u, 404, "not_found", "user not found");
      const surface = q.get("surface") ?? "your_sound";
      need(surface === "your_sound" || surface === "mix", 400, "bad_request", "surface must be your_sound or mix");
      need(surface !== "mix" || !!q.get("seed"), 422, "validation_error", "seed must be a song people can play");
      const rich = u!.id === "usr_listener";
      const items = rich || surface === "mix"
        ? state.tracks.filter((t) => !blocks.some((b) => b.targetId === t.id)).slice(0, 6).map((t, i) => ({
            trackId: t.id, title: t.title, artistId: "art_mock", artistName: "Mock Artist " + (i + 1), slot: i % 3 === 2 ? "discovery" : "familiar", score: 0.62 - i * 0.05,
            reasons: i % 3 === 2 ? ["genre_you_chose", "new_artist_for_you", "under_discovered"] : ["favourite_artist", "genre_you_play", "preferred_language"],
            parts: { artist: 0.224, genre: 0.16, popularity: 0.04, heard_lately: i === 3 ? -0.2 : 0 },
          }))
        : [];
      return ok({
        algorithm: "hybrid-1", discoveryMode: "explore_more", candidates: items.length ? 240 : 0,
        basis: { preferredLanguages: rich ? ["luganda"] : [], understoodLanguages: rich ? ["english"] : [], regions: [], genres: rich ? ["gospel"] : [], favouriteArtists: rich ? 2 : 0, followedArtists: rich ? 1 : 0, songsWithHistory: rich ? 14 : 0 },
        items,
      });
    }
    if ((mt = p.match(/^\/users\/([^/]+)\/signals$/)) && m === "PUT") {
      const u = getUser(mt[1]!);
      need(u, 404, "not_found", "user not found");
      const excluded = body.excluded === true;
      need(excluded || u!.role !== "admin", 409, "is_admin", "administrators are always left out of recommendation signals");
      u!.signalsExcluded = excluded;
      return none;
    }
    if ((mt = p.match(/^\/users\/([^/]+)\/preference-graph$/)) && m === "GET") {
      const u = getUser(mt[1]!);
      need(u, 404, "not_found", "user not found");
      const rich = u!.id === "usr_listener";
      const none = { plays: 0, finished: 0, skipped: 0, replays: 0, likes: 0, playlistAdds: 0, savedSongs: 0 };
      const node = (type: string, id: string, label: string, more: Record<string, unknown> = {}, activity: Partial<typeof none> = {}) => ({ id: type + ":" + id, type, label, chosen: false, ...more, activity: { ...none, ...activity } });
      const [a1, a2, a3] = state.artists.filter((x) => !x.ban);
      const nodes = rich
        ? [
            node("language", "luganda", "Luganda", { chosen: true }),
            node("language", "english", "English", { understood: true }),
            node("region", "central", "Central", { chosen: true }),
            node("genre", "afrobeats", "Afrobeats", { chosen: true }, { plays: 48, finished: 40, likes: 6, savedSongs: 5 }),
            node("genre", "gospel", "Gospel", { chosen: true }),
            node("genre", "hip-hop", "Hip-Hop", {}, { plays: 12, finished: 3, skipped: 9 }),
            node("artist", a1!.id, a1!.name, { chosen: true, followed: true }, { plays: 31, finished: 27, replays: 4, likes: 5, playlistAdds: 2, savedSongs: 4 }),
            node("artist", a2!.id, a2!.name, { followed: true }),
            node("artist", a3!.id, a3!.name, {}, { plays: 14, finished: 6, skipped: 2 }),
          ]
        : u!.id.endsWith("1")
          ? [node("language", "acholi", "Acholi", { chosen: true }), node("genre", "dancehall", "Dancehall", { chosen: true })]
          : [];
      const link = (artist: string, genre: string, weight: number) => ({ source: "artist:" + artist, target: "genre:" + genre, kind: "artist_genre", weight });
      return ok({
        onboarding: { completed: nodes.length > 0, updatedAt: nodes.length ? new Date(Date.now() - 6 * 86400_000).toISOString() : null, discoveryMode: rich ? "explore_more" : "" },
        windowDays: 90,
        nodes,
        links: rich ? [link(a1!.id, "afrobeats", 7), link(a2!.id, "gospel", 1), link(a3!.id, "hip-hop", 4), link(a3!.id, "afrobeats", 2)] : [],
      });
    }
    if ((mt = p.match(/^\/users\/([^/]+)$/)) && m === "GET") {
      const u = getUser(mt[1]!);
      need(u, 404, "not_found", "user not found");
      const a = artistOfUser(u!.id);
      return ok({
        id: u!.id, email: u!.email, displayName: u!.displayName, role: u!.role, emailVerified: u!.emailVerified, banned: !!u!.ban, hasArtist: !!a, createdAt: u!.createdAt,
        ban: u!.ban ? { at: u!.ban.at, reason: u!.ban.reason, by: u!.ban.by === "usr_admin" ? { id: "usr_admin", email: MOCK_ADMIN_EMAIL } : null } : null, signIn: { password: u!.methods.includes("password"), apple: u!.methods.includes("apple"), google: u!.methods.includes("google") }, artist: a ? { id: a.id, name: a.name } : null, counts: { playlists: 2, followedArtists: 5, savedItems: 14 }, lastSeenAt: u!.lastSeenAt ?? null, pushEnabled: u!.id.endsWith("3"), signalsExcluded: u!.role === "admin" || !!u!.signalsExcluded,
      });
    }
    if ((mt = p.match(/^\/users\/([^/]+)\/(ban|unban|deletion-preview)$/)) && (m === "POST" || m === "GET")) {
      const u = getUser(mt[1]!);
      need(u, 404, "not_found", "user not found");
      const op = mt[2];
      if (op === "deletion-preview" && m === "GET") {
        const a = artistOfUser(u!.id);
        const rels = a ? state.releases.filter((r) => r.artistId === a.id) : [];
        if (a?.received) return ok({ artist: { id: a.id, name: a.name, returnsToCatalog: true }, releases: 0, tracks: 0, playlists: 2, uploads: 0, storageBytes: 0, libraryItems: 14, sessions: 1 });
        return ok({ artist: a ? { id: a.id, name: a.name } : null, releases: rels.length, tracks: rels.reduce((s, r) => s + releaseTracks(r.id).length, 0), playlists: 2, uploads: 0, storageBytes: a?.usedBytes ?? 0, libraryItems: 14, sessions: 1 });
      }
      need(m === "POST" && op !== "deletion-preview", 405, "method_not_allowed", "method not allowed");
      need(u!.role !== "admin", 409, "is_admin", "administrators cannot be banned or deleted");
      if (op === "ban") {
        const reason = reasonOf(body);
        need(!u!.ban, 409, "already_banned", "already banned");
        u!.ban = { at: new Date().toISOString(), reason, by: actor.id };
        const ua = artistOfUser(u!.id);
        if (ua && !ua.ban) ua.ban = u!.ban;
        addAudit(actor, "user.ban", "user", u!.id, u!.email, reason);
      } else {
        need(u!.ban, 409, "not_banned", "not banned");
        u!.ban = null;
        const ua = artistOfUser(u!.id);
        if (ua) ua.ban = null;
        addAudit(actor, "user.unban", "user", u!.id, u!.email, typeof body.note === "string" ? body.note : "");
      }
      return none;
    }
    if ((mt = p.match(/^\/users\/([^/]+)$/)) && m === "DELETE") {
      const u = getUser(mt[1]!);
      need(u, 404, "not_found", "user not found");
      need(u!.role !== "admin", 409, "is_admin", "administrators cannot be banned or deleted");
      const reason = reasonOf(body);
      need(body.confirmEmail === u!.email, 422, "confirmation_mismatch", "confirmEmail does not match");
      const a = artistOfUser(u!.id);
      if (a?.received) {
        a.ownerUserId = undefined;
        a.received = false;
      } else if (a) removeArtist(a.id);
      state.users.splice(state.users.indexOf(u!), 1);
      addAudit(actor, "user.delete", "user", u!.id, u!.email, reason);
      return none;
    }

    // ---------------------------------------------------------- artists
    if (m === "GET" && p === "/artists") {
      const term = (q.get("q") ?? "").toLowerCase();
      let rows = state.artists.filter((a) => !term || a.name.toLowerCase().includes(term));
      const status = q.get("status");
      if (status === "pending") rows = rows.filter((a) => a.verification === "pending");
      if (status === "flagged") rows = rows.filter((a) => a.flagged);
      if (status === "banned") rows = rows.filter((a) => a.ban);
      if (status === "active") rows = rows.filter((a) => !a.ban);
      const vf = q.get("verification");
      if (vf) rows = rows.filter((a) => a.verification === vf);
      if (q.get("flagged") === "true") rows = rows.filter((a) => a.flagged);
      if (q.get("banned") === "true") rows = rows.filter((a) => a.ban);
      rows = [...rows].sort((a, b) => (a.requestedAt ?? a.createdAt).localeCompare(b.requestedAt ?? b.createdAt));
      const pg = pageOf(rows, q);
      return ok({ total: pg.total, artists: pg.rows.map(artistRow) });
    }
    if ((mt = p.match(/^\/artists\/([^/]+)$/)) && m === "GET") {
      const a = state.artists.find((x) => x.id === mt![1]);
      need(a, 404, "not_found", "artist not found");
      const owner = a!.ownerUserId ? getUser(a!.ownerUserId) : undefined;
      const rels = state.releases.filter((r) => r.artistId === a!.id);
      return ok({
        id: a!.id, name: a!.name, bio: a!.bio, imageUrl: artistRow(a!).imageUrl,
        verification: { state: a!.verification, message: a!.verificationMessage, note: a!.verificationNote, requestedAt: a!.requestedAt ?? null },
        flagged: a!.flagged, ban: a!.ban, owner: owner ? { id: owner.id, email: owner.email, displayName: owner.displayName } : null,
        storage: artistStorage(a!),
        counts: { releases: rels.length, publicReleases: rels.filter((r) => r.visibility === "public").length, tracks: rels.reduce((s, r) => s + releaseTracks(r.id).length, 0), followers: a!.followerCount, plays: a!.followerCount * 9 },
        recentGrants: [...a!.grants].reverse().slice(0, 10), createdAt: a!.createdAt,
      });
    }
    if ((mt = p.match(/^\/artists\/([^/]+)\/owner$/)) && (m === "POST" || m === "DELETE")) {
      const a = state.artists.find((x) => x.id === mt![1]);
      need(a, 404, "not_found", "artist not found");
      const reason = reasonOf(body);
      if (m === "POST") {
        const u = getUser(String(body.userId ?? ""));
        need(u, 404, "user_not_found", "user not found");
        need(!a!.ownerUserId, 409, "already_owned", "the artist already has an owner");
        need(!a!.ban, 409, "artist_banned", "this artist is banned");
        need(!u!.ban, 409, "user_banned", "this user is banned");
        need(u!.emailVerified, 409, "email_unverified", "the email address is not verified");
        need(!artistOfUser(u!.id), 409, "user_has_artist", "this user already has an artist profile");
        a!.ownerUserId = u!.id;
        a!.received = true;
        if (!a!.grants.some((g) => g.kind === "free")) {
          a!.quotaBytes = 10 * 1024 ** 3;
          a!.grants.push({ id: a!.grants.length + 1, kind: "free", bytes: a!.quotaBytes, note: "welcome allowance", createdAt: new Date().toISOString() });
        }
        addAudit(actor, "artist.assign", "artist", a!.id, a!.name, reason, { userId: u!.id, email: u!.email });
      } else {
        need(a!.ownerUserId, 409, "not_owned", "the artist has no owner");
        const was = getUser(a!.ownerUserId!);
        a!.ownerUserId = undefined;
        a!.received = false;
        if (a!.verification === "pending") a!.verification = "unverified";
        addAudit(actor, "artist.unassign", "artist", a!.id, a!.name, reason, { userId: was?.id, email: was?.email });
      }
      return routes({ method: "GET" } as IncomingMessage, new URL(`http://mock/v1/admin/artists/${a!.id}`), {}, actor);
    }
    if ((mt = p.match(/^\/artists\/([^/]+)$/)) && m === "PATCH") {
      const a = state.artists.find((x) => x.id === mt![1]);
      need(a, 404, "not_found", "artist not found");
      if (body.name !== undefined) {
        need(typeof body.name === "string" && body.name.trim().length >= 1 && body.name.trim().length <= 100, 422, "validation_error", "name must be 1-100 characters");
        a!.name = (body.name as string).trim();
      }
      if (body.bio !== undefined) {
        need(typeof body.bio === "string" && body.bio.length <= 1000, 422, "validation_error", "bio must be at most 1000 characters");
        a!.bio = body.bio as string;
      }
      if (body.imageId !== undefined) {
        need(!a!.ownerUserId, 422, "owned_artist", "this artist's picture is its owner's profile picture");
        const cid = String(body.imageId);
        if (cid === "") a!.avatarImageId = undefined;
        else {
          const im = images.get(cid);
          need(im && im.ready && im.owner === actor.id, 422, "validation_error", "the picture must be a finished image uploaded by you");
          a!.avatarImageId = cid;
        }
      }
      addAudit(actor, "artist.update", "artist", a!.id, a!.name, "", { fields: Object.keys(body) });
      return ok(artistRow(a!));
    }
    if ((mt = p.match(/^\/artists\/([^/]+)\/(ban|unban)$/)) && m === "POST") {
      const a = state.artists.find((x) => x.id === mt![1]);
      need(a, 404, "not_found", "artist not found");
      if (mt[2] === "ban") {
        const reason = reasonOf(body);
        need(!a!.ban, 409, "already_banned", "already banned");
        a!.ban = { at: new Date().toISOString(), reason, by: actor.id };
        addAudit(actor, "artist.ban", "artist", a!.id, a!.name, reason);
      } else {
        need(a!.ban, 409, "not_banned", "not banned");
        need(!(a!.ownerUserId && getUser(a!.ownerUserId)?.ban), 409, "user_banned", "the owner account is banned: unban the user instead");
        a!.ban = null;
        addAudit(actor, "artist.unban", "artist", a!.id, a!.name, typeof body.note === "string" ? body.note : "");
      }
      return none;
    }
    if ((mt = p.match(/^\/artists\/([^/]+)\/verification$/)) && m === "POST") {
      const a = state.artists.find((x) => x.id === mt![1]);
      need(a, 404, "not_found", "artist not found");
      const d = body.decision;
      need(d === "approve" || d === "verify" || d === "reject" || d === "revoke", 400, "bad_request", "decision must be approve, verify, reject or revoke");
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (d === "verify") {
        need(!a!.ban, 409, "artist_banned", "this artist is banned");
        need(a!.verification !== "verified", 409, "already_verified", "this artist is already verified");
        need(note.length <= 500, 422, "validation_error", "the note is at most 500 characters");
        a!.verification = "verified";
        a!.verificationNote = "";
        a!.flagged = false;
        addAudit(actor, "artist.verify", "artist", a!.id, a!.name, note);
      } else if (d === "approve") {
        need(a!.verification === "pending", 409, "not_pending", "no pending verification request");
        need(note.length <= 500, 422, "validation_error", "the note is at most 500 characters");
        a!.verification = "verified";
        addAudit(actor, "artist.verify", "artist", a!.id, a!.name, note);
      } else if (d === "reject") {
        need(a!.verification === "pending", 409, "not_pending", "no pending verification request");
        need(note.length >= 3, 422, "validation_error", "a rejection needs a note");
        a!.verification = "rejected";
        a!.verificationNote = note;
        addAudit(actor, "artist.reject", "artist", a!.id, a!.name, note);
      } else {
        need(a!.verification === "verified", 409, "not_verified", "artist is not verified");
        need(note.length >= 3, 422, "validation_error", "revoking needs a note");
        a!.verification = "unverified";
        addAudit(actor, "artist.revoke", "artist", a!.id, a!.name, note);
      }
      a!.requestedAt = undefined;
      return none;
    }
    if ((mt = p.match(/^\/artists\/([^/]+)\/storage-grants$/)) && m === "POST") {
      const a = state.artists.find((x) => x.id === mt![1]);
      need(a, 404, "not_found", "artist not found");
      const bytes = Number(body.bytes);
      need(Number.isFinite(bytes) && bytes !== 0, 422, "validation_error", "bytes must be non-zero");
      a!.grants.push({ id: a!.grants.length + 1, kind: String(body.kind ?? "promo"), bytes, note: String(body.note ?? ""), createdAt: new Date().toISOString() });
      a!.quotaBytes += bytes;
      addAudit(actor, "artist.storage_grant", "artist", a!.id, a!.name, String(body.note ?? ""), { bytes });
      return ok({ created: true }, 201);
    }
    if ((mt = p.match(/^\/artists\/([^/]+)\/deletion-preview$/)) && m === "GET") {
      const a = state.artists.find((x) => x.id === mt![1]);
      need(a, 404, "not_found", "artist not found");
      const rels = state.releases.filter((r) => r.artistId === a!.id);
      const tcount = rels.reduce((s, r) => s + releaseTracks(r.id).length, 0);
      return ok({ releases: rels.length, tracks: tcount, uploads: 0, storageBytes: a!.usedBytes, storageGrants: a!.grants.length, followers: a!.followerCount });
    }
    if ((mt = p.match(/^\/artists\/([^/]+)$/)) && m === "DELETE") {
      const a = state.artists.find((x) => x.id === mt![1]);
      need(a, 404, "not_found", "artist not found");
      const reason = reasonOf(body);
      need(body.confirmName === a!.name, 422, "confirmation_mismatch", "confirmName does not match");
      removeArtist(a!.id);
      addAudit(actor, "artist.delete", "artist", a!.id, a!.name, reason);
      return none;
    }

    // --------------------------------------------------- release reviews
    if (!reviews.some((x) => x.subject === "profile")) {
      const a = state.artists[0]!;
      const values = { name: a.name, bio: "Singer from Gulu." };
      reviews.push({ subject: "profile", id: "arv_mock1", releaseId: "", title: a.name, type: "profile", kind: "new", status: "pending", revision: 1, artist: { id: a.id, name: a.name }, submittedAt: new Date(Date.now() - 600_000).toISOString(), publishAt: null, decidedAt: null, reason: "", changes: [], detail: { decidedBy: null, artistCreatedAt: new Date(Date.now() - 86400_000).toISOString(), approved: values, proposed: values, changeItems: [], releaseReviewIds: [] } });
    }
    if (p === "/reviews" && m === "GET") {
      const status = q.get("status") || "pending";
      const rows = reviews.filter((x) => (status === "all" || x.status === status) && (!q.get("kind") || x.kind === q.get("kind")) && (!q.get("subject") || x.subject === q.get("subject")));
      const { rows: page, total } = pageOf(rows, q);
      return ok({ reviews: page.map((x) => ({ ...x, detail: undefined })), total, pending: reviews.filter((x) => x.status === "pending").length });
    }
    if ((mt = p.match(/^\/reviews\/([^/]+?)(?:\/(approve|reject))?$/))) {
      const rv = reviews.find((x) => x.id === mt![1]);
      need(rv, 404, "not_found", "review not found");
      if (mt[2]) {
        need(m === "POST", 405, "method_not_allowed", "method not allowed");
        need(rv!.status === "pending", 409, "not_pending", "this is not waiting");
        need(body.revision === rv!.revision, 409, "review_changed", "it changed");
        const reason = String(body.reason ?? "").trim();
        need(mt[2] === "approve" || (reason.length >= 3 && reason.length <= 500), 422, "validation_error", "give a reason of 3-500 characters");
        rv!.status = mt[2] === "approve" ? "approved" : "rejected";
        rv!.reason = mt[2] === "reject" ? reason : "";
        rv!.decidedAt = new Date().toISOString();
        rv!.detail.decidedBy = actorOf(actor);
        addAudit(actor, "review." + mt[2], "release", rv!.releaseId, rv!.title, rv!.reason, { reviewId: rv!.id, kind: rv!.kind, revision: rv!.revision });
      }
      const { detail, ...row } = rv!;
      return ok({ ...row, ...detail });
    }

    // ----------------------------------------------------------- lyrics
    if ((mt = p.match(/^\/tracks\/([^/]+)\/lyrics$/)) && (m === "GET" || m === "PUT" || m === "DELETE")) {
      const t = state.tracks.find((x) => x.id === mt![1]);
      need(t, 404, "not_found", "track not found");
      if (m === "DELETE") {
        if (lyrics.delete(t!.id)) addAudit(actor, "track.lyrics_delete", "track", t!.id, t!.title);
        return none;
      }
      if (m === "PUT") {
        const typed = String(body.lrc || body.text || "");
        const c = checkLyrics(typed, t!.durationMs);
        need(c.kind !== "empty", 422, "validation_error", "send text or lrc");
        need(!c.errors.length, 422, "validation_error", c.errors[0]?.message ?? "");
        const timed = c.kind === "timed";
        lyrics.set(t!.id, { synced: timed, lines: c.lines, text: timed ? c.lines.map((l) => l.text).join("\n") : typed.trim(), ...(timed ? { lrc: typed.trim() } : {}) });
        addAudit(actor, "track.lyrics_update", "track", t!.id, t!.title, "", { synced: timed, lines: c.lines.length, translated: c.translated });
      }
      const saved = lyrics.get(t!.id) ?? null;
      const untranslated = saved?.synced ? checkLyrics(editable(saved), 0) : undefined;
      return ok({ trackId: t!.id, title: t!.title, durationMs: t!.durationMs, lyrics: saved, untranslatedLines: untranslated ? untranslated.lyricLines - untranslated.translated : 0 });
    }

    // ------------------------------------------------- featured artists
    const guestView = (releaseId: string) => {
      const shape = (c: Guest) => {
        const a = state.artists.find((x) => x.id === c.artistId);
        return { creditId: c.creditId, ...(c.artistId ? { artistId: c.artistId } : {}), name: c.addedByTeam && a ? a.name : c.name, verified: c.addedByTeam && a?.verification === "verified", addedByTeam: c.addedByTeam, artistBanned: !!a?.ban };
      };
      const rows = guests.filter((c) => c.releaseId === releaseId);
      return {
        releaseId,
        release: rows.filter((c) => !c.trackId).map(shape),
        tracks: releaseTracks(releaseId).map((t) => ({ trackId: t.id, title: t.title, artists: rows.filter((c) => c.trackId === t.id).map(shape) })),
      };
    };
    if ((mt = p.match(/^\/(releases|tracks)\/([^/]+)\/featured-artists$/)) && (m === "GET" || m === "POST")) {
      const onTrack = mt[1] === "tracks";
      const track = onTrack ? state.tracks.find((t) => t.id === mt![2]) : undefined;
      const rel = state.releases.find((x) => x.id === (onTrack ? track?.releaseId : mt![2]));
      need(rel, 404, "not_found", onTrack ? "track not found" : "release not found");
      if (m === "POST") {
        const a = state.artists.find((x) => x.id === body.artistId);
        need(a && a.id !== rel!.artistId, 422, "validation_error", "choose another artist");
        need(!a!.ban, 409, "artist_banned", "this artist is banned");
        const trackId = track?.id ?? "";
        const old = guests.find((c) => c.releaseId === rel!.id && c.trackId === trackId && c.artistId === a!.id);
        if (!old?.addedByTeam) {
          need(guests.filter((c) => c.releaseId === rel!.id).length < 100, 409, "too_many_credits", "too many credits");
          if (old) old.addedByTeam = true;
          else guests.push({ creditId: "crd_" + randomBytes(6).toString("hex"), releaseId: rel!.id, trackId, artistId: a!.id, name: a!.name, addedByTeam: true });
          addAudit(actor, "release.feature_artist", "release", rel!.id, rel!.title, "", { artistId: a!.id, artistName: a!.name, trackId });
        }
      }
      return ok(guestView(rel!.id));
    }
    if ((mt = p.match(/^\/featured-artists\/([^/]+)$/)) && m === "DELETE") {
      const i = guests.findIndex((c) => c.creditId === mt![1]);
      need(i >= 0, 404, "not_found", "feature not found");
      const [gone] = guests.splice(i, 1);
      const rel = state.releases.find((x) => x.id === gone!.releaseId)!;
      addAudit(actor, "release.unfeature_artist", "release", rel.id, rel.title, "", { artistId: gone!.artistId ?? "", artistName: gone!.name, trackId: gone!.trackId });
      return ok(guestView(rel.id));
    }

    // --------------------------------------------------------- releases
    if ((mt = p.match(/^\/releases\/([^/]+)\/featured$/)) && (m === "PUT" || m === "DELETE")) {
      const r = state.releases.find((x) => x.id === mt![1]);
      need(r, 404, "not_found", "release not found");
      if (m === "PUT") {
        need(r!.type !== "single", 409, "not_eligible", "only albums and EPs can be featured");
        need(!r!.takedown, 409, "taken_down", "the release was taken down");
        if (!featured.includes(r!.id)) featured.push(r!.id);
      } else if (featured.includes(r!.id)) featured.splice(featured.indexOf(r!.id), 1);
      addAudit(actor, m === "PUT" ? "release.feature" : "release.unfeature", "release", r!.id, r!.title);
      return ok(releaseRow(r!));
    }
    if (p === "/featured-releases/order" && m === "PUT") {
      const ids = Array.isArray(body.releaseIds) ? (body.releaseIds as string[]) : [];
      need(ids.length === featured.length && new Set(ids).size === ids.length && ids.every((i) => featured.includes(i)), 422, "validation_error", "list every featured release once");
      featured.splice(0, featured.length, ...ids);
      addAudit(actor, "release.featured_order", "release", "featured", "Featured releases", "", { releaseIds: ids });
      return { status: 204 };
    }
    if (m === "GET" && p === "/taxonomy") {
      if (q.get("usage") !== "true") return ok(taxonomy);
      const used = (key: "languages" | "cultures" | "regions" | "genres", id: string) => state.tracks.filter((x) => metaOf(x)[key].some((l) => l.id === id)).length;
      const counted = <T extends { id: string }>(key: "languages" | "cultures" | "regions" | "genres", list: T[]) => list.map((x) => ({ ...x, usage: used(key, x.id) }));
      return ok({ ...taxonomy, languages: counted("languages", taxonomy.languages), cultures: counted("cultures", taxonomy.cultures), regions: counted("regions", taxonomy.regions), genres: counted("genres", taxonomy.genres) });
    }
    if ((mt = p.match(/^\/taxonomy\/(language-groups|languages|cultures|regions|genres)(?:\/([^/]+))?$/)) && (m === "POST" ? !mt[2] : m === "PATCH" && !!mt[2])) {
      type Item = { id: string; label: string; active?: boolean; groupId?: string | null; parentId?: string | null };
      const kind = mt[1]!;
      const list = (kind === "language-groups" ? taxonomy.languageGroups : taxonomy[kind as "languages" | "cultures" | "regions" | "genres"]) as Item[];
      const item = mt[2] ? list.find((x) => x.id === mt![2]) : undefined;
      need(m === "POST" || item, 404, "not_found", "no such entry");
      const allowed = ["label", ...(kind === "languages" ? ["groupId"] : []), ...(kind === "genres" ? ["parentId"] : []), ...(m === "PATCH" && kind !== "language-groups" ? ["active"] : [])];
      need(Object.keys(body).length > 0 && Object.keys(body).every((k) => allowed.includes(k)), 422, "validation_error", "a field this list does not have");
      const label = typeof body.label === "string" ? body.label.trim() : undefined;
      if (m === "POST" || "label" in body) {
        need(label && label.length <= (kind === "genres" ? 40 : 60), 422, "validation_error", "the name is empty or too long");
        need(!list.some((x) => x !== item && x.label.toLowerCase() === label!.toLowerCase()), 409, "duplicate_label", "already in this list");
      }
      if (body.groupId) need(taxonomy.languageGroups.some((g) => g.id === body.groupId), 422, "validation_error", "unknown group");
      if (body.parentId) {
        const parent = taxonomy.genres.find((g) => g.id === body.parentId);
        need(parent && !parent.parentId && parent.id !== item?.id && !taxonomy.genres.some((g) => g.parentId === item?.id && !!item), 422, "invalid_parent", "not a possible parent");
      }
      if (!item) {
        let id = slug(label!) || "entry";
        while (list.some((x) => x.id === id)) id += "_2";
        const made: Item = { id, label: label!, ...(kind === "language-groups" ? {} : { active: true }), ...(kind === "languages" ? { groupId: (body.groupId as string | null) ?? null } : {}), ...(kind === "genres" ? { parentId: (body.parentId as string | null) ?? null } : {}) };
        list.push(made);
        addAudit(actor, "taxonomy.create", "taxonomy", made.id, made.label, "", { kind });
        return { status: 201, data: made };
      }
      const before = item.label;
      Object.assign(item, body, label === undefined ? {} : { label });
      if (kind === "genres" && label !== undefined) for (const x of [...state.tracks, ...state.releases]) if (x.genre === before) x.genre = label;
      addAudit(actor, "taxonomy.update", "taxonomy", item.id, item.label, "", { kind, changed: body });
      return ok(item);
    }
    if ((mt = p.match(/^\/tracks\/([^/]+)\/metadata\/(submit|review)$/)) && m === "POST") {
      const t = state.tracks.find((x) => x.id === mt![1]);
      need(t, 404, "not_found", "track not found");
      const cur = metaOf(t!);
      need(body.version === "v" + cur.version, 409, "stale_version", "the track was changed meanwhile");
      if (mt[2] === "submit") {
        need(metaView(t!).missingRequired.length === 0, 422, "missing_required", "required metadata is missing");
        if (!cur.submittedAt) {
          cur.submittedAt = new Date().toISOString();
          cur.reviewNote = "";
          cur.touched = true;
          cur.version++;
          addAudit(actor, "track.metadata_submit", "track", t!.id, t!.title);
        }
        return ok(metaView(t!));
      }
      const items = (body.items ?? []) as { category: string; id: string }[];
      const decision = body.decision === "reject" ? "rejected" : "verified";
      const note = String(body.note ?? "").trim();
      need(items.length > 0 && (decision === "verified" || note.length >= 3), 422, "validation_error", "choose values, and give a reason when rejecting");
      const found = items.map((i) => {
        if (i.category === "languageUnknown") return cur.languageUnknown ? cur.unknownReview : undefined;
        const list = (cur as unknown as Record<string, MetaLink[]>)[i.category] ?? cur.attributes[i.category];
        return list?.find((x) => x.id === i.id);
      });
      need(found.every(Boolean), 422, "validation_error", "a value is not on this track");
      for (const x of found) Object.assign(x!, { verification: decision, verifiedBy: actorOf(actor), verifiedAt: new Date().toISOString() });
      cur.reviewNote = decision === "rejected" ? note : "";
      if (decision === "rejected") cur.submittedAt = null;
      cur.version++;
      addAudit(actor, decision === "rejected" ? "track.metadata_reject" : "track.metadata_verify", "track", t!.id, t!.title, note);
      return ok(metaView(t!));
    }
    if ((p === "/metadata/bulk" || p === "/metadata/bulk-verify") && m === "POST") {
      const ids = Array.isArray(body.trackIds) ? (body.trackIds as string[]) : [];
      need(ids.length >= 1 && ids.length <= 100 && new Set(ids).size === ids.length, 422, "validation_error", "choose 1-100 tracks");
      const tracks = ids.map((id) => state.tracks.find((x) => x.id === id));
      need(tracks.every(Boolean), 404, "not_found", "a track was not found");
      const dryRun = body.dryRun === true;
      if (!dryRun) {
        const versions = (body.versions ?? {}) as Record<string, string>;
        need(tracks.every((x) => versions[x!.id] === "v" + metaOf(x!).version), 409, "stale_version", "a track changed after the preview");
      }
      const verify = p.endsWith("verify");
      type Value = { category: string; id: string };
      type Change = { mode: string; values?: { id: string; role?: string; primary?: boolean }[]; ids?: string[] };
      const changes = (body.changes ?? {}) as Partial<Record<"languages" | "genres" | "regions", Change>>;
      const categories = (body.categories ?? []) as string[];
      need(verify ? categories.length > 0 : Object.keys(changes).length > 0, 422, "validation_error", "choose what to change");
      const known = { languages: taxonomy.languages, genres: taxonomy.genres, regions: taxonomy.regions };
      for (const [k, c] of Object.entries(changes)) {
        const wanted = c!.values?.map((v) => v.id) ?? c!.ids ?? [];
        need(wanted.length > 0, 422, "validation_error", "nothing chosen");
        need(wanted.every((id) => known[k as keyof typeof known].some((x) => x.id === id && x.active)), 422, "invalid_taxonomy", "unknown choice");
      }
      const results = tracks.map((tr) => {
        const cur = metaOf(tr!);
        const row = { trackId: tr!.id, title: tr!.title, version: "v" + cur.version, outcome: "unchanged", reason: "", added: [] as Value[], removed: [] as Value[], primaryChanged: [] as string[], verified: [] as Value[] };
        const copy: Meta = JSON.parse(JSON.stringify(cur));
        if (verify) {
          const listOf = (c: string): MetaLink[] => (c === "languages" ? [...copy.languages, ...(copy.languageUnknown && copy.unknownReview ? [copy.unknownReview] : [])] : ((copy as unknown as Record<string, MetaLink[]>)[c] ?? copy.attributes[c] ?? []));
          for (const c of categories)
            for (const l of listOf(c))
              if (l.verification === "pending") {
                Object.assign(l, { verification: "verified", verifiedBy: actorOf(actor), verifiedAt: new Date().toISOString() });
                row.verified.push({ category: c, id: l.id });
              }
        } else {
          if (copy.languageUnknown && changes.languages?.mode === "add") return { ...row, outcome: "skipped", reason: "language_unknown" };
          const apply = (category: "languages" | "genres" | "regions", c: Change) => {
            const flag = category === "languages" ? "role" : category === "genres" ? "primary" : null;
            const isPrimary = (x: { role?: string; primary?: boolean }) => (flag === "role" ? x.role === "primary" : x.primary === true);
            const wanted: { id: string; role?: string; primary?: boolean }[] = c.values ?? (c.ids ?? []).map((id) => ({ id }));
            const old = copy[category];
            const before = old.find((x) => flag && isPrimary(x))?.id;
            const next = c.mode === "replace" ? [] : [...old];
            for (const w of wanted) {
              const was = old.find((x) => x.id === w.id);
              if (c.mode === "add" && was) continue;
              const demote = c.mode === "add" && flag && isPrimary(w) && next.some(isPrimary);
              const value = demote ? { ...w, ...(flag === "role" ? { role: "secondary" } : { primary: false }) } : w;
              next.push(was ? (was.role === value.role && was.primary === value.primary ? was : { ...was, ...value, verification: "pending" }) : { ...fresh("admin", w.id), ...value });
            }
            row.added.push(...next.filter((x) => !old.some((o) => o.id === x.id)).map((x) => ({ category, id: x.id })));
            row.removed.push(...old.filter((o) => !next.some((x) => x.id === o.id)).map((x) => ({ category, id: x.id })));
            if (flag && before !== next.find(isPrimary)?.id) row.primaryChanged.push(category);
            copy[category] = next;
          };
          if (changes.languages) {
            if (changes.languages.mode === "replace" && copy.languageUnknown) {
              copy.languageUnknown = false;
              copy.unknownReview = null;
              row.removed.push({ category: "languageUnknown", id: "" });
            }
            apply("languages", changes.languages);
          }
          if (changes.genres) apply("genres", changes.genres);
          if (changes.regions) apply("regions", changes.regions);
        }
        const touchedNow = JSON.stringify(copy) !== JSON.stringify(cur);
        if (!touchedNow) return row;
        row.outcome = "changed";
        if (!dryRun) {
          metas.set(tr!.id, { ...copy, version: cur.version + 1, touched: true, updatedAt: new Date().toISOString(), updatedBy: actorOf(actor) });
          if (row.primaryChanged.includes("genres")) {
            const primary = copy.genres.find((g) => g.primary);
            tr!.genre = primary ? taxonomy.genres.find((g) => g.id === primary.id)!.label : "";
          }
          addAudit(actor, verify ? "track.metadata_verify" : "track.metadata_update", "track", tr!.id, tr!.title, "", { bulk: true });
        }
        return row;
      });
      const n = (o: string) => results.filter((r) => r.outcome === o).length;
      return ok({ results, changed: n("changed"), unchanged: n("unchanged"), skipped: n("skipped") });
    }
    if (m === "GET" && p === "/metadata/tracks") {
      const rows = state.tracks.flatMap((t) => {
        const rel = state.releases.find((r) => r.id === t.releaseId);
        if (!rel) return [];
        if (q.get("artistId") && rel.artistId !== q.get("artistId")) return [];
        if (q.get("releaseType") && rel.type !== q.get("releaseType")) return [];
        const term = (q.get("q") ?? "").toLowerCase();
        if (term && !t.title.toLowerCase().includes(term) && !rel.title.toLowerCase().includes(term)) return [];
        return [metaView(t)];
      });
      const open = (l: { verification: string }[]) => l.some((x) => x.verification === "pending");
      const tests: Record<string, (v: (typeof rows)[number]) => boolean> = {
        pending_review: (v) => v.status === "pending_review",
        no_language: (v) => !v.languageUnknown && !v.languages.some((x) => x.verification !== "rejected"),
        unverified_language: (v) => open(v.languages) || (!!v.languageUnknownReview && open([v.languageUnknownReview])),
        no_genre: (v) => !v.genres.some((x) => x.verification !== "rejected"),
        culture_region_review: (v) => open(v.cultures) || open(v.regions),
        incomplete: (v) => v.missingRequired.length > 0,
      };
      const test = tests[q.get("queue") ?? ""];
      need(test, 400, "bad_request", "unknown queue");
      const pg = pageOf(rows.filter(test!), q);
      return ok({ total: pg.total, counts: Object.fromEntries(Object.entries(tests).map(([k, f]) => [k, rows.filter(f).length])), tracks: pg.rows.map((v) => ({ trackId: v.trackId, title: v.title, releaseId: v.release.id, releaseTitle: v.release.title, releaseType: v.release.type, artist: v.artist, status: v.status, missingRequired: v.missingRequired, languageUnknown: v.languageUnknown })) });
    }
    if ((mt = p.match(/^\/releases\/([^/]+)\/track-metadata$/)) && m === "GET") {
      need(state.releases.some((x) => x.id === mt![1]), 404, "not_found", "release not found");
      return ok({ releaseId: mt[1], tracks: releaseTracks(mt[1]!).sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0)).map(metaView) });
    }
    if ((mt = p.match(/^\/tracks\/([^/]+)\/metadata$/)) && (m === "GET" || m === "PUT")) {
      const t = state.tracks.find((x) => x.id === mt![1]);
      need(t, 404, "not_found", "track not found");
      if (m === "GET") return ok(metaView(t!));
      const cur = metaOf(t!);
      need(body.version === "v" + cur.version, 409, "stale_version", "the track was changed meanwhile");
      const attrs = (body.attributes ?? {}) as Record<string, string[]>;
      const merge = (old: MetaLink[], next: { id: string; role?: string; primary?: boolean }[], known: { id: string; active: boolean }[]) =>
        next.map((n) => {
          const was = old.find((o) => o.id === n.id);
          const term = known.find((k) => k.id === n.id);
          need(term && (term.active || was), 422, "invalid_taxonomy", "unknown or inactive choice: " + n.id);
          if (!was) return { ...fresh("admin", n.id), ...n };
          return was.role === n.role && was.primary === n.primary ? was : { ...was, ...n, verification: "pending", verifiedBy: null, verifiedAt: null };
        });
      const languages = (body.languages ?? []) as { id: string; role: string }[];
      const genres = (body.genres ?? []) as { id: string; primary: boolean }[];
      need(languages.filter((l) => l.role === "primary").length <= 1 && genres.filter((g) => g.primary).length <= 1, 422, "validation_error", "only one primary");
      need(!(body.languageUnknown === true && languages.length > 0), 422, "validation_error", "unknown language excludes languages");
      need((attrs.energy ?? []).length <= 1 && (attrs.danceability ?? []).length <= 1, 422, "validation_error", "one energy and one danceability value");
      const next: Meta = {
        languageUnknown: body.languageUnknown === true,
        languages: merge(cur.languages, languages, taxonomy.languages),
        cultures: merge(cur.cultures, ((body.cultures ?? []) as string[]).map((id) => ({ id })), taxonomy.cultures),
        regions: merge(cur.regions, ((body.regions ?? []) as string[]).map((id) => ({ id })), taxonomy.regions),
        genres: merge(cur.genres, genres, taxonomy.genres),
        attributes: Object.fromEntries(Object.entries(taxonomy.attributes).map(([k, known]) => [k, merge(cur.attributes[k] ?? [], (attrs[k] ?? []).map((id) => ({ id })), known)])),
        version: cur.version + 1, touched: true, updatedAt: new Date().toISOString(), updatedBy: actorOf(actor),
      };
      next.unknownReview = next.languageUnknown ? (cur.languageUnknown && cur.unknownReview ? cur.unknownReview : fresh("admin", "")) : null;
      next.submittedAt = next.languageUnknown || next.languages.some((l) => l.verification !== "rejected") ? (cur.submittedAt ?? null) : null;
      metas.set(t!.id, next);
      const primary = next.genres.find((g) => g.primary);
      if (primary) t!.genre = taxonomy.genres.find((g) => g.id === primary.id)!.label;
      addAudit(actor, "track.metadata_update", "track", t!.id, t!.title);
      return ok(metaView(t!));
    }
    if (m === "GET" && p === "/releases") {
      const term = (q.get("q") ?? "").toLowerCase();
      let rows = state.releases.filter((r) => !term || r.title.toLowerCase().includes(term) || (state.artists.find((a) => a.id === r.artistId)?.name ?? "").toLowerCase().includes(term));
      if (q.get("visibility")) rows = rows.filter((r) => r.visibility === q.get("visibility"));
      if (q.get("takenDown") === "true") rows = rows.filter((r) => r.takedown);
      if (q.get("takenDown") === "false") rows = rows.filter((r) => !r.takedown);
      if (q.get("artistId")) rows = rows.filter((r) => r.artistId === q.get("artistId"));
      if (q.get("type")) rows = rows.filter((r) => r.type === q.get("type"));
      if (q.get("metadata")) rows = rows.filter((r) => releaseProgress(r).status === q.get("metadata"));
      if (q.get("pendingReview") === "true") rows = rows.filter((r) => releaseProgress(r).pendingReview > 0);
      if (q.get("featured") === "false") rows = rows.filter((r) => !featured.includes(r.id));
      rows = q.get("featured") === "true" ? rows.filter((r) => featured.includes(r.id)).sort((a, b) => featured.indexOf(a.id) - featured.indexOf(b.id)) : [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const pg = pageOf(rows, q);
      return ok({ total: pg.total, releases: pg.rows.map(releaseRow) });
    }
    if ((mt = p.match(/^\/releases\/([^/]+)$/)) && m === "GET") {
      const r = state.releases.find((x) => x.id === mt![1]);
      need(r, 404, "not_found", "release not found");
      return ok({ uploads: uploadsOf(r!.id), ...releaseRow(r!), description: r!.description, genre: r!.genre, publishAt: r!.publishAt ?? null, updatedAt: r!.createdAt, artist: { id: r!.artistId, name: state.artists.find((x) => x.id === r!.artistId)?.name ?? "", banned: !!state.artists.find((x) => x.id === r!.artistId)?.ban }, takedown: r!.takedown ? { at: r!.takedown.at, reason: r!.takedown.reason, by: { id: "usr_admin", email: MOCK_ADMIN_EMAIL }, previousVisibility: r!.prevVisibility ?? "draft", byBan: false } : null, tracks: releaseTracks(r!.id).map((t) => ({ id: t.id, title: t.title, trackNumber: t.trackNumber, durationMs: t.durationMs, visibility: r!.visibility === "public" ? "public" : "draft", explicit: t.explicit, genre: t.genre })) });
    }
    if ((mt = p.match(/^\/releases\/([^/]+)$/)) && m === "PATCH") {
      const r = state.releases.find((x) => x.id === mt![1]);
      need(r, 404, "not_found", "release not found");
      if (body.title !== undefined) {
        need(typeof body.title === "string" && body.title.trim().length >= 1 && body.title.trim().length <= 150, 422, "validation_error", "title must be 1-150 characters");
        r!.title = (body.title as string).trim();
      }
      if (body.description !== undefined) r!.description = String(body.description).slice(0, 2000);
      if (body.genre !== undefined) r!.genre = String(body.genre).slice(0, 60);
      if (body.releaseDate !== undefined) {
        need(body.releaseDate === "" || /^\d{4}-\d{2}-\d{2}$/.test(String(body.releaseDate)), 422, "validation_error", "releaseDate must be YYYY-MM-DD");
        r!.releaseDate = body.releaseDate === "" ? undefined : String(body.releaseDate);
      }
      if (body.coverImageId !== undefined) {
        const cid = String(body.coverImageId);
        if (cid === "") r!.coverImageId = undefined;
        else {
          const im = images.get(cid);
          need(im && im.ready && im.owner === actor.id, 422, "validation_error", "the cover must be a finished cover image uploaded by you");
          r!.coverImageId = cid;
        }
      }
      if (body.releaseType !== undefined) {
        need(body.releaseType === "single" || body.releaseType === "album", 422, "validation_error", "releaseType must be single or album");
        r!.type = body.releaseType as "single" | "album";
      }
      addAudit(actor, "release.update", "release", r!.id, r!.title, "", { fields: Object.keys(body) });
      return ok(releaseRow(r!));
    }
    if ((mt = p.match(/^\/releases\/([^/]+)\/(takedown|restore|deletion-preview)$/))) {
      const r = state.releases.find((x) => x.id === mt![1]);
      need(r, 404, "not_found", "release not found");
      if (mt[2] === "deletion-preview" && m === "GET") {
        const n = releaseTracks(r!.id).length;
        return ok({ tracks: n, files: n * 4, storageBytes: n * 9_000_000, libraryReferences: n * 3, playlistReferences: state.playlists.filter((pl) => pl.trackIds.some((id) => releaseTracks(r!.id).some((t) => t.id === id))).length });
      }
      need(m === "POST", 405, "method_not_allowed", "method not allowed");
      if (mt[2] === "takedown") {
        const reason = reasonOf(body);
        need(!r!.takedown, 409, "already_taken_down", "already taken down");
        r!.prevVisibility = r!.visibility;
        r!.visibility = "draft";
        r!.takedown = { at: new Date().toISOString(), reason };
        addAudit(actor, "release.takedown", "release", r!.id, r!.title, reason);
      } else if (mt[2] === "restore") {
        need(r!.takedown, 409, "not_taken_down", "not taken down");
        r!.visibility = r!.prevVisibility ?? "draft";
        r!.takedown = undefined;
        addAudit(actor, "release.restore", "release", r!.id, r!.title, typeof body.note === "string" ? body.note : "");
      }
      return none;
    }
    if ((mt = p.match(/^\/releases\/([^/]+)$/)) && m === "DELETE") {
      const r = state.releases.find((x) => x.id === mt![1]);
      need(r, 404, "not_found", "release not found");
      const reason = reasonOf(body);
      removeRelease(r!.id);
      addAudit(actor, "release.delete", "release", r!.id, r!.title, reason);
      return none;
    }
    if ((mt = p.match(/^\/tracks\/([^/]+)$/)) && (m === "PATCH" || m === "DELETE")) {
      const t = state.tracks.find((x) => x.id === mt![1]);
      need(t, 404, "not_found", "track not found");
      if (m === "DELETE") {
        const reason = reasonOf(body);
        state.tracks.splice(state.tracks.indexOf(t!), 1);
        for (const pl of state.playlists) pl.trackIds = pl.trackIds.filter((id) => id !== t!.id);
        addAudit(actor, "track.delete", "track", t!.id, t!.title, reason);
        return none;
      }
      if (body.title !== undefined) {
        need(typeof body.title === "string" && body.title.trim().length >= 1 && body.title.trim().length <= 150, 422, "validation_error", "title must be 1-150 characters");
        t!.title = (body.title as string).trim();
      }
      if (body.explicit !== undefined) t!.explicit = !!body.explicit;
      if (body.genre !== undefined) t!.genre = String(body.genre).slice(0, 60);
      if (body.trackNumber !== undefined) t!.trackNumber = Number(body.trackNumber) || t!.trackNumber;
      addAudit(actor, "track.update", "track", t!.id, t!.title, "", { fields: Object.keys(body) });
      return ok({ id: t!.id });
    }

    // -------------------------------------------------------- playlists
    if (m === "GET" && p === "/playlists") {
      const term = (q.get("q") ?? "").toLowerCase();
      let rows = state.playlists.filter((pl) => !term || pl.name.toLowerCase().includes(term));
      if (q.get("featured") === "true") rows = rows.filter((pl) => pl.isFeatured);
      if (q.get("published") === "true") rows = rows.filter((pl) => pl.isPublic);
      if (q.get("published") === "false") rows = rows.filter((pl) => !pl.isPublic);
      const pg = pageOf(rows, q);
      return ok({ total: pg.total, playlists: pg.rows.map(playlistRow) });
    }
    if (m === "POST" && p === "/playlists") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      need(name.length >= 1 && name.length <= 100, 422, "validation_error", "name must be 1-100 characters");
      const pl: Playlist = { id: `pl_${randomBytes(6).toString("hex")}`, name, description: String(body.description ?? "").slice(0, 500), isPublic: false, isFeatured: false, trackIds: [], updatedAt: new Date().toISOString() };
      state.playlists.push(pl);
      addAudit(actor, "playlist.create", "playlist", pl.id, pl.name);
      return ok({ ...playlistRow(pl), items: [] }, 201);
    }
    if ((mt = p.match(/^\/playlists\/([^/]+)$/))) {
      const pl = state.playlists.find((x) => x.id === mt![1]);
      need(pl, 404, "not_found", "playlist not found");
      if (m === "GET") return ok({ ...playlistRow(pl!), items: playlistItems(pl!) });
      if (m === "PATCH") {
        if (body.name !== undefined) {
          need(typeof body.name === "string" && body.name.trim().length >= 1 && body.name.trim().length <= 100, 422, "validation_error", "name must be 1-100 characters");
          pl!.name = (body.name as string).trim();
        }
        if (body.description !== undefined) pl!.description = String(body.description).slice(0, 500);
        if (body.coverImageId !== undefined) {
          const cid = String(body.coverImageId);
          if (cid === "") pl!.coverImageId = undefined;
          else {
            const im = images.get(cid);
            need(im && im.ready && im.owner === actor.id, 422, "validation_error", "the cover must be a finished cover image uploaded by you");
            pl!.coverImageId = cid;
          }
        }
        pl!.updatedAt = new Date().toISOString();
        addAudit(actor, "playlist.update", "playlist", pl!.id, pl!.name, "", { fields: Object.keys(body) });
        return ok({ ...playlistRow(pl!), items: playlistItems(pl!) });
      }
      if (m === "DELETE") {
        state.playlists.splice(state.playlists.indexOf(pl!), 1);
        for (const g of state.groups) g.playlistIds = g.playlistIds.filter((x) => x !== pl!.id);
        addAudit(actor, "playlist.delete", "playlist", pl!.id, pl!.name);
        return none;
      }
    }
    if ((mt = p.match(/^\/playlists\/([^/]+)\/items$/)) && m === "PUT") {
      const pl = state.playlists.find((x) => x.id === mt![1]);
      need(pl, 404, "not_found", "playlist not found");
      const ids = body.trackIds;
      need(Array.isArray(ids) && ids.every((i) => typeof i === "string") && ids.length <= 500, 422, "validation_error", "trackIds must be a list of track ids");
      for (const id of ids as string[]) need(state.tracks.some((t) => t.id === id), 422, "unknown_track", `unknown track ${id}`);
      pl!.trackIds = ids as string[];
      pl!.updatedAt = new Date().toISOString();
      addAudit(actor, "playlist.items", "playlist", pl!.id, pl!.name, "", { count: pl!.trackIds.length });
      return ok({ ...playlistRow(pl!), items: playlistItems(pl!) });
    }
    if ((mt = p.match(/^\/playlists\/([^/]+)\/(publish|unpublish)$/)) && m === "POST") {
      const pl = state.playlists.find((x) => x.id === mt![1]);
      need(pl, 404, "not_found", "playlist not found");
      if (mt[2] === "publish") {
        need(pl!.trackIds.some((id) => { const t = state.tracks.find((x) => x.id === id); return t && trackPublic(t); }), 422, "no_public_track", "a playlist needs at least one public track to be published");
        pl!.isPublic = true;
        pl!.isFeatured = true;
      } else {
        pl!.isPublic = false;
        pl!.isFeatured = false;
      }
      pl!.updatedAt = new Date().toISOString();
      addAudit(actor, `playlist.${mt[2]}`, "playlist", pl!.id, pl!.name);
      return ok({ ...playlistRow(pl!), items: playlistItems(pl!) });
    }

    // ------------------------------------------- import keys and runs
    if (p === "/api-keys" && m === "GET") return ok({ keys: [...keys].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    if (p === "/api-keys" && m === "POST") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      need(name.length >= 1 && name.length <= 60, 422, "validation_error", "name must be 1-60 characters");
      const days = body.expiresInDays === undefined ? 30 : Number(body.expiresInDays);
      need(Number.isInteger(days) && days >= 1 && days <= 365, 422, "validation_error", "expiresInDays must be between 1 and 365");
      const key = "blac_imp_" + randomBytes(32).toString("base64url");
      const k: Key = { id: "key_" + randomBytes(8).toString("hex"), name, prefix: key.slice(0, 15), createdBy: actor.email, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + days * DAY).toISOString(), revokedAt: null, lastUsedAt: null };
      keys.push(k);
      addAudit(actor, "apikey.create", "apikey", k.id, k.name, "", { scope: "import", expiresAt: k.expiresAt });
      return ok({ id: k.id, name: k.name, prefix: k.prefix, scope: "import", expiresAt: k.expiresAt, key }, 201);
    }
    if ((mt = p.match(/^\/api-keys\/([^/]+)$/)) && m === "DELETE") {
      const k = keys.find((x) => x.id === mt![1] && !x.revokedAt);
      need(k, 404, "not_found", "no such active key");
      k!.revokedAt = new Date().toISOString();
      addAudit(actor, "apikey.revoke", "apikey", k!.id, k!.name);
      return none;
    }
    if (p === "/imports" && m === "GET") {
      const newest = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const state = q.get("state");
      need(state === null || state === "unfinished" || state === "finished", 400, "bad_request", "unknown state");
      const live = (j: Job) => j.status === "pending" || j.status === "processing";
      if (state === "finished") {
        const done = newest.filter((j) => !live(j)).sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt));
        const limit = Math.min(100, Math.max(1, Number(q.get("limit") ?? 20) || 20));
        const offset = Math.max(0, Number(q.get("offset") ?? 0) || 0);
        return ok({ imports: done.slice(offset, offset + limit).map((j) => jobView(j, false)), total: done.length });
      }
      const rows = state === "unfinished" ? newest.filter(live) : newest.slice(0, 20);
      return ok({ imports: rows.map((j) => jobView(j, false)) });
    }
    if ((mt = p.match(/^\/imports\/([^/]+)$/))) {
      const j = jobs.find((x) => x.jobId === mt![1]);
      need(j, 404, "not_found", "no such import");
      if (m === "GET") return ok(jobView(j!, true));
      if (m === "DELETE") {
        need(j!.status === "pending", 409, "not_pending", "only an import that has not started can be cancelled");
        j!.status = "cancelled";
        j!.finishedAt = new Date().toISOString();
        addAudit(actor, "import.cancel", "import", j!.jobId, j!.artist);
        return none;
      }
    }

    // ----------------------------------------- create artist and release, audio
    if (m === "POST" && p === "/artists") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      need(name.length >= 1 && name.length <= 100, 422, "validation_error", "name must be 1-100 characters");
      need(body.bio === undefined || (typeof body.bio === "string" && body.bio.length <= 1000), 422, "validation_error", "bio must be at most 1000 characters");
      const a: Artist = {
        id: "art_" + randomBytes(12).toString("hex"), name, bio: String(body.bio ?? "").trim(), verification: "unverified", verificationMessage: "", verificationNote: "",
        flagged: state.artists.some((x) => x.verification === "verified" && x.name.toLowerCase() === name.toLowerCase()), ban: null, followerCount: 0,
        createdAt: new Date().toISOString(), quotaBytes: 0, usedBytes: 0, grants: [],
      };
      if (body.imageId !== undefined && body.imageId !== "") {
        const im = images.get(String(body.imageId));
        need(im && im.ready && im.owner === actor.id, 422, "validation_error", "the picture must be a finished image uploaded by you");
        a.avatarImageId = String(body.imageId);
      }
      state.artists.push(a);
      addAudit(actor, "artist.create", "artist", a.id, a.name);
      return ok({
        id: a.id, name: a.name, bio: a.bio, imageUrl: a.avatarImageId ? mediaUrl(a.avatarImageId) : undefined,
        verification: { state: a.verification, message: "", note: "", requestedAt: null }, flagged: a.flagged, ban: null, owner: null,
        storage: { usedBytes: 0, quotaBytes: 0 }, counts: { releases: 0, publicReleases: 0, tracks: 0, followers: 0, plays: 0 }, recentGrants: [], createdAt: a.createdAt,
      }, 201);
    }
    if ((mt = p.match(/^\/artists\/([^/]+)\/releases$/)) && m === "POST") {
      const a = state.artists.find((x) => x.id === mt![1]);
      need(a, 404, "not_found", "artist not found");
      const title = typeof body.title === "string" ? body.title.trim() : "";
      need(title.length >= 1 && title.length <= 200, 422, "validation_error", "title must be 1-200 characters");
      need(body.type === "single" || body.type === "album", 422, "validation_error", "type must be single or album");
      need(body.releaseDate === undefined || body.releaseDate === "" || /^\d{4}-\d{2}-\d{2}$/.test(String(body.releaseDate)), 422, "validation_error", "releaseDate must be YYYY-MM-DD");
      const rel: Release = {
        id: "alb_" + randomBytes(12).toString("hex"), artistId: a!.id, title, type: body.type as "single" | "album", description: String(body.description ?? "").slice(0, 2000),
        genre: String(body.genre ?? "").slice(0, 60), visibility: "draft", createdAt: new Date().toISOString(), releaseDate: body.releaseDate ? String(body.releaseDate) : undefined,
      };
      if (body.coverImageId !== undefined && body.coverImageId !== "") {
        const im = images.get(String(body.coverImageId));
        need(im && im.ready && im.owner === actor.id, 422, "validation_error", "the cover must be a finished cover image uploaded by you");
        rel.coverImageId = String(body.coverImageId);
      }
      state.releases.push(rel);
      addAudit(actor, "release.create", "release", rel.id, rel.title, "", { artistId: a!.id });
      return ok({ uploads: [], ...releaseRow(rel), description: rel.description, genre: rel.genre, publishAt: null, updatedAt: rel.createdAt, artist: { id: a!.id, name: a!.name, banned: !!a!.ban }, takedown: null, tracks: [] }, 201);
    }
    if ((mt = p.match(/^\/tracks\/([^/]+)\/single$/)) && m === "POST") {
      const t = state.tracks.find((x) => x.id === mt![1]);
      need(t, 404, "not_found", "track not found");
      const from = state.releases.find((x) => x.id === t!.releaseId)!;
      need(from.type !== "single", 409, "already_single", "it is already a single");
      need(!state.artists.find((x) => x.id === from.artistId)?.ban, 409, "artist_banned", "this artist is banned");
      need(!from.takedown, 409, "taken_down", "the release was taken down");
      const title = typeof body.title === "string" ? body.title.trim() : "";
      need(title.length >= 1 && title.length <= 200, 422, "validation_error", "title must be 1-200 characters");
      const visibility = body.visibility === "public" ? "public" : "draft";
      const made: Release = { ...from, id: "alb_single_" + randomBytes(6).toString("hex"), title, type: "single", visibility, genre: String(body.genre ?? from.genre), coverImageId: typeof body.coverImageId === "string" ? body.coverImageId : body.useAlbumCover === true ? from.coverImageId : undefined, createdAt: new Date().toISOString(), publishedAt: visibility === "public" ? new Date().toISOString() : undefined, publishAt: undefined };
      state.releases.push(made);
      t!.releaseId = made.id;
      t!.trackNumber = 1;
      const rest = releaseTracks(from.id);
      if (rest.length === 0) state.releases.splice(state.releases.indexOf(from), 1);
      else rest.forEach((x, i) => (x.trackNumber = i + 1));
      addAudit(actor, "release.split", "release", made.id, title, "", { fromReleaseId: from.id, fromTitle: from.title, trackId: t!.id });
      return ok({ uploads: [], ...releaseRow(made), description: "", genre: made.genre, publishAt: null, takedown: null, tracks: [] }, 201);
    }
    if (p === "/releases/combine" && m === "POST") {
      const ids = Array.isArray(body.releaseIds) ? (body.releaseIds as string[]) : [];
      need(ids.length >= 2 && new Set(ids).size === ids.length, 422, "validation_error", "choose at least two releases");
      const old = ids.map((id) => state.releases.find((x) => x.id === id));
      need(old.every(Boolean), 404, "not_found", "release not found");
      const art = state.artists.find((x) => x.id === old[0]!.artistId)!;
      need(old.every((r) => r!.artistId === art.id), 409, "different_artists", "the releases belong to different artists");
      need(!art.ban, 409, "artist_banned", "this artist is banned");
      need(old.every((r) => !r!.takedown), 409, "taken_down", "a release was taken down");
      need(old.every((r) => releaseTracks(r!.id).length > 0), 409, "no_tracks", "a release has no tracks");
      const songs = old.flatMap((r) => releaseTracks(r!.id));
      const order = Array.isArray(body.trackIds) ? (body.trackIds as string[]) : [];
      need(order.length === songs.length && songs.every((t) => order.includes(t.id)), 422, "validation_error", "trackIds must list every song once");
      const title = typeof body.title === "string" ? body.title.trim() : "";
      need(title.length >= 1 && title.length <= 200, 422, "validation_error", "title must be 1-200 characters");
      const from = typeof body.coverFromReleaseId === "string" ? old.find((r) => r!.id === body.coverFromReleaseId) : undefined;
      const visibility = body.visibility === "public" ? "public" : "draft";
      const made: Release = { ...old[0]!, id: "alb_combined_" + randomBytes(6).toString("hex"), title, type: "album", visibility, genre: String(body.genre ?? ""), coverImageId: typeof body.coverImageId === "string" ? body.coverImageId : from?.coverImageId, createdAt: new Date().toISOString(), publishedAt: visibility === "public" ? new Date().toISOString() : undefined, publishAt: undefined };
      state.releases.push(made);
      for (const t of songs) {
        t.releaseId = made.id;
        t.trackNumber = order.indexOf(t.id) + 1;
      }
      for (const r of old) state.releases.splice(state.releases.indexOf(r!), 1);
      addAudit(actor, "release.combine", "release", made.id, title, "", { from: old.map((r) => ({ id: r!.id, title: r!.title })) });
      return ok({ uploads: [], ...releaseRow(made), description: "", genre: made.genre, publishAt: null, takedown: null, tracks: [] }, 201);
    }
    if ((mt = p.match(/^\/releases\/([^/]+)\/(publish|unpublish)$/)) && m === "POST") {
      const r = state.releases.find((x) => x.id === mt![1]);
      need(r, 404, "not_found", "release not found");
      need(!r!.takedown, 409, "taken_down", "this release was taken down; restore it first");
      if (mt[2] === "publish") {
        need(!state.artists.find((x) => x.id === r!.artistId)?.ban, 409, "artist_banned", "this artist is banned");
        need(!uploadsOf(r!.id).some((u) => u.status !== "failed"), 409, "uploads_pending", "some files are still uploading or processing; wait until they are ready");
        need(releaseTracks(r!.id).length > 0, 422, "no_tracks", "add at least one track before publishing");
        need(r!.type !== "single" || releaseTracks(r!.id).length === 1, 422, "validation_error", "a single must have exactly one track (make it an album instead)");
        const at = typeof body.publishAt === "string" && body.publishAt ? Date.parse(body.publishAt) : NaN;
        if (Number.isFinite(at) && at > Date.now()) {
          r!.visibility = "scheduled";
          r!.publishAt = new Date(at).toISOString();
        } else {
          r!.visibility = "public";
          r!.publishedAt = new Date().toISOString();
          r!.publishAt = undefined;
        }
      } else {
        r!.visibility = "draft";
        r!.publishAt = undefined;
      }
      addAudit(actor, `release.${mt[2]}`, "release", r!.id, r!.title);
      return ok({ uploads: uploadsOf(r!.id), ...releaseRow(r!), description: r!.description, genre: r!.genre, publishAt: r!.publishAt ?? null, takedown: null, tracks: [] });
    }
    if ((mt = p.match(/^\/releases\/([^/]+)\/uploads$/)) && m === "POST") {
      const r = state.releases.find((x) => x.id === mt![1]);
      need(r, 404, "not_found", "release not found");
      need(body.rightsConfirmed === true, 422, "validation_error", "confirm that you have the rights to upload this recording");
      const title = typeof body.title === "string" ? body.title.trim() : "";
      need(title.length >= 1 && title.length <= 200, 422, "validation_error", "title must be 1-200 characters");
      const size = Number(body.sizeBytes);
      need(Number.isInteger(size) && size >= 1 && size <= 2 * 1024 ** 3, 422, "validation_error", "sizeBytes must be between 1 byte and 2 GB");
      need(typeof body.filename === "string" && body.filename.length > 0, 422, "validation_error", "filename is required");
      const multipart = size > 2 * PART;
      const u: Upload = {
        id: "upl_" + randomBytes(10).toString("hex"), releaseId: r!.id, title, genre: String(body.genre ?? ""), trackNumber: typeof body.trackNumber === "number" ? body.trackNumber : undefined,
        explicit: body.explicit === true, filename: String(body.filename), sizeBytes: size, status: "pending", partSize: PART, partCount: multipart ? Math.ceil(size / PART) : 1, multipart, got: new Map(),
      };
      uploads.set(u.id, u);
      addAudit(actor, "track.upload", "release", r!.id, r!.title, "rights confirmed by the administrator", { uploadId: u.id, filename: u.filename });
      const target = multipart
        ? { type: "multipart", method: "PUT", partSize: u.partSize, partCount: u.partCount, parts: partTargets(u), expiresAt: new Date(Date.now() + 3_600_000).toISOString() }
        : { type: "single", method: "PUT", url: partTargets(u)[0]!.url, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
      return ok({ ...uploadView(u), upload: target, maxBytes: 2 * 1024 ** 3 }, 201);
    }
    if ((mt = p.match(/^\/uploads\/([^/]+)(?:\/(parts|complete))?$/))) {
      const u = uploads.get(mt[1]!);
      need(u, 404, "not_found", "upload not found");
      settle();
      if (!mt[2] && m === "GET") return ok(uploadView(u!));
      if (!mt[2] && m === "DELETE") {
        uploads.delete(u!.id);
        return none;
      }
      if (mt[2] === "parts" && m === "GET") {
        need(u!.multipart, 400, "not_multipart", "this upload is a single PUT; there are no parts");
        need(u!.status === "pending", 409, "not_pending", "this upload is no longer waiting for parts");
        const done = [...u!.got.entries()].filter(([n, s]) => s === partSizeOf(u!, n)).map(([n]) => n);
        const todo = Array.from({ length: u!.partCount }, (_, i) => i + 1).filter((n) => !done.includes(n));
        return ok({ partSize: u!.partSize, partCount: u!.partCount, uploaded: done, parts: partTargets(u!, todo), expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
      }
      if (mt[2] === "complete" && m === "POST") {
        if (u!.status !== "pending") return ok(uploadView(u!));
        if (u!.multipart) {
          const missing = Array.from({ length: u!.partCount }, (_, i) => i + 1).filter((n) => u!.got.get(n) !== partSizeOf(u!, n));
          if (missing.length > 0) throw new HttpErr(409, "parts_missing", `parts missing or the wrong size: ${missing.join(", ")}`);
        } else {
          need((u!.got.get(1) ?? 0) > 0, 409, "not_uploaded", "the file has not been uploaded yet");
        }
        u!.status = "queued";
        u!.readyAt = Date.now() + 1500;
        return ok(uploadView(u!));
      }
    }

    // --------------------------------------------------- sections (groups)
    const groupOut = (g: Group) => ({ id: g.id, title: g.title, description: g.description, position: g.position, isActive: g.isActive, playlistCount: g.playlistIds.filter((id) => state.playlists.find((x) => x.id === id)?.isPublic).length, playlistIds: g.playlistIds });
    if (m === "GET" && p === "/playlist-groups") return ok({ groups: [...state.groups].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map(groupOut) });
    if (m === "POST" && p === "/playlist-groups") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      need(title.length >= 1 && title.length <= 60, 422, "validation_error", "title must be 1-60 characters");
      const id = (typeof body.id === "string" && body.id) || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      need(!state.groups.some((g) => g.id === id), 409, "conflict", "a section with this id already exists");
      const position = typeof body.position === "number" ? body.position : Math.max(0, ...state.groups.map((g) => g.position)) + 10;
      const g: Group = { id, title, description: String(body.description ?? "").slice(0, 300), position, isActive: body.isActive !== false, playlistIds: [] };
      state.groups.push(g);
      addAudit(actor, "section.create", "section", g.id, g.title);
      return ok(groupOut(g), 201);
    }
    if ((mt = p.match(/^\/playlist-groups\/([^/]+)$/))) {
      const g = state.groups.find((x) => x.id === mt![1]);
      need(g, 404, "not_found", "section not found");
      if (m === "GET") return ok(groupOut(g!));
      if (m === "PATCH") {
        if (body.title !== undefined) {
          need(typeof body.title === "string" && body.title.trim().length >= 1 && body.title.trim().length <= 60, 422, "validation_error", "title must be 1-60 characters");
          g!.title = (body.title as string).trim();
        }
        if (body.description !== undefined) g!.description = String(body.description).slice(0, 300);
        if (typeof body.position === "number") g!.position = body.position;
        if (typeof body.isActive === "boolean") g!.isActive = body.isActive;
        addAudit(actor, "section.update", "section", g!.id, g!.title, "", { fields: Object.keys(body) });
        return ok(groupOut(g!));
      }
      if (m === "DELETE") {
        state.groups.splice(state.groups.indexOf(g!), 1);
        addAudit(actor, "section.delete", "section", g!.id, g!.title);
        return none;
      }
    }
    if ((mt = p.match(/^\/playlist-groups\/([^/]+)\/playlists$/)) && m === "PUT") {
      const g = state.groups.find((x) => x.id === mt![1]);
      need(g, 404, "not_found", "section not found");
      const ids = body.playlistIds;
      need(Array.isArray(ids) && ids.every((i) => typeof i === "string"), 400, "bad_request", "playlistIds is required (use [] to empty the section)");
      for (const id of ids as string[]) need(state.playlists.some((x) => x.id === id), 422, "unknown_playlist", `unknown playlist ${id}`);
      g!.playlistIds = [...new Set(ids as string[])];
      addAudit(actor, "section.playlists", "section", g!.id, g!.title, "", { count: g!.playlistIds.length });
      return ok(groupOut(g!));
    }

    // ------------------------------------------------------ search insights
    const range = q.get("range") ?? "30d";
    const rangeDays = range === "7d" ? 7 : range === "90d" ? 90 : 30;
    const terms: { q: string; kind: string; w: number; results: number }[] = [
      { q: "burna boy", kind: "artists", w: 95, results: 12 }, { q: "amapiano", kind: "tracks", w: 88, results: 40 }, { q: "afrobeats 2026", kind: "playlists", w: 70, results: 6 },
      { q: "gospel worship", kind: "playlists", w: 64, results: 0 }, { q: "kampala", kind: "tracks", w: 52, results: 9 }, { q: "wizkid", kind: "artists", w: 49, results: 0 },
      { q: "workout", kind: "playlists", w: 46, results: 3 }, { q: "chill vibes", kind: "playlists", w: 41, results: 2 }, { q: "love songs", kind: "tracks", w: 39, results: 25 },
      { q: "podcast comedy", kind: "tracks", w: 33, results: 0 }, { q: "ugandan hits", kind: "playlists", w: 31, results: 0 }, { q: "rema calm down", kind: "tracks", w: 29, results: 0 },
      { q: "sunrise", kind: "albums", w: 24, results: 5 }, { q: "lulu", kind: "artists", w: 22, results: 3 }, { q: "street drum", kind: "tracks", w: 20, results: 4 },
      { q: "reggae roots", kind: "playlists", w: 17, results: 1 }, { q: "kizz daniel", kind: "artists", w: 15, results: 0 }, { q: "wedding songs", kind: "playlists", w: 14, results: 0 },
      { q: "drill", kind: "tracks", w: 11, results: 0 }, { q: "efua beats", kind: "artists", w: 9, results: 2 },
    ];
    const rowFor = (tm: (typeof terms)[number], i: number) => {
      const rr = rng(i * 7919 + rangeDays);
      const count = Math.max(1, Math.round(tm.w * rangeDays * (0.9 + rr() * 0.3)));
      const rising = i % 4 === 1 || i === 10 || i === 11;
      const previousCount = Math.max(0, Math.round(count * (rising ? 0.35 : 0.85 + rr() * 0.3)));
      return { query: tm.q, kind: tm.kind, count, noResultCount: tm.results === 0 ? count : Math.round(count * 0.04), previousCount, lastAt: new Date(Date.now() - Math.floor(rr() * 6) * 3_600_000).toISOString(), results: tm.results };
    };
    if (m === "GET" && p === "/search/overview") {
      const rows = terms.map(rowFor);
      const searches = rows.reduce((s, r) => s + r.count, 0);
      const noRes = rows.reduce((s, r) => s + r.noResultCount, 0);
      const prev = rows.reduce((s, r) => s + r.previousCount, 0);
      return ok({ searches, uniqueQueries: rows.length * 37, noResultSearches: noRes, noResultRate: noRes / searches, previous: { searches: prev, noResultSearches: Math.round(noRes * 0.9) } });
    }
    if (m === "GET" && p === "/search/top") {
      const kind = q.get("kind");
      const term = (q.get("q") ?? "").toLowerCase();
      let rows = terms.map(rowFor).filter((r) => (!kind || r.kind === kind) && (!term || r.query.includes(term)));
      if (q.get("sort") === "rising") rows = rows.filter((r) => r.count >= 3 && r.count > r.previousCount).sort((a, b) => b.count / Math.max(1, b.previousCount) - a.count / Math.max(1, a.previousCount));
      else rows.sort((a, b) => b.count - a.count);
      const pg = pageOf(rows, q);
      return ok({ total: pg.total, items: pg.rows.map((r) => ({ query: r.query, count: r.count, noResultCount: r.noResultCount, previousCount: r.previousCount, lastAt: r.lastAt })) });
    }
    if (m === "GET" && p === "/search/kinds") {
      const by = new Map<string, number>(["tracks", "artists", "playlists", "albums"].map((k) => [k, 0]));
      for (const r of terms.map(rowFor)) by.set(r.kind, (by.get(r.kind) ?? 0) + r.count);
      return ok({ items: [...by.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count) });
    }
    if (m === "GET" && p === "/search/no-results") {
      const kind = q.get("kind");
      const rows = terms.map(rowFor).filter((r) => r.results === 0 && (!kind || r.kind === kind)).sort((a, b) => b.count - a.count);
      const pg = pageOf(rows, q);
      return ok({ total: pg.total, items: pg.rows.map((r) => ({ query: r.query, count: r.count, lastAt: r.lastAt })) });
    }

    // -------------------------------------------------------- audit log
    if (m === "GET" && p === "/audit-log") {
      let rows = [...state.audit];
      if (q.get("actor")) rows = rows.filter((e) => e.actor.email.includes(q.get("actor")!) || e.actor.id === q.get("actor"));
      if (q.get("action")) rows = rows.filter((e) => e.action === q.get("action") || e.action.startsWith(`${q.get("action")}.`));
      if (q.get("targetType")) rows = rows.filter((e) => e.targetType === q.get("targetType"));
      if (q.get("targetId")) rows = rows.filter((e) => e.targetId === q.get("targetId"));
      if (q.get("from")) rows = rows.filter((e) => e.at >= q.get("from")!);
      if (q.get("to")) rows = rows.filter((e) => e.at <= `${q.get("to")!}T23:59:59.999Z`);
      rows.sort((a, b) => b.id - a.id);
      const pg = pageOf(rows, q);
      return ok({ total: pg.total, entries: pg.rows });
    }

    throw new HttpErr(404, "not_found", "no such admin route");
  };

  function removeRelease(id: string): void {
    const gone = new Set(releaseTracks(id).map((t) => t.id));
    state.tracks = state.tracks.filter((t) => t.releaseId !== id);
    state.releases = state.releases.filter((r) => r.id !== id);
    for (const pl of state.playlists) pl.trackIds = pl.trackIds.filter((t) => !gone.has(t));
  }
  function removeArtist(id: string): void {
    for (const r of state.releases.filter((x) => x.artistId === id)) removeRelease(r.id);
    state.artists = state.artists.filter((a) => a.id !== id);
  }

  const send = (res: ServerResponse, status: number, data?: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(data === undefined || status === 204 ? undefined : JSON.stringify(data));
  };

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://mock");
      const entry = { method: req.method ?? "", path: url.pathname + url.search, xff: req.headers["x-forwarded-for"] as string | undefined, auth: req.headers.authorization };
      log.push(entry);
      const rawPath = url.pathname;
      const upPart = /^\/mock-storage\/up\/([^/]+)\/(\d+)$/.exec(rawPath);
      if (req.method === "PUT" && upPart) {
        const up = uploads.get(upPart[1]!);
        if (!up) return send(res, 404, { error: { code: "not_found", message: "no such upload" } });
        up.got.set(Number(upPart[2]), Buffer.concat(chunks).length);
        return send(res, 200);
      }
      if (req.method === "PUT" && rawPath.startsWith("/mock-storage/")) {
        const id = rawPath.slice("/mock-storage/".length);
        const im = images.get(id);
        if (!im) return send(res, 404, { error: { code: "not_found", message: "no such upload" } });
        im.size = Buffer.concat(chunks).length;
        return send(res, 200);
      }
      if (req.method === "GET" && rawPath.startsWith("/v1/media/")) {
        const id = rawPath.split("/")[3] ?? "x";
        let h = 0;
        for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,45%)"/><stop offset="1" stop-color="hsl(${(h + 60) % 360},70%,30%)"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/></svg>`;
        res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" });
        return res.end(svg);
      }
      if (req.method === "GET" && rawPath.startsWith("/mock-audio/")) {
        // a few seconds of a quiet tone (8 kHz, 8-bit mono WAV), pitched by the track id
        const id = rawPath.slice("/mock-audio/".length).replace(/\.wav$/, "");
        let h = 0;
        for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 400;
        const rate = 8000, secs = 8, n = rate * secs, freq = 220 + h;
        const wav = Buffer.alloc(44 + n);
        wav.write("RIFF", 0); wav.writeUInt32LE(36 + n, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
        wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(n, 40);
        for (let i = 0; i < n; i++) wav[44 + i] = 128 + Math.round(40 * Math.sin((2 * Math.PI * freq * i) / rate) * Math.min(1, i / 400, (n - i) / 400));
        const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
        if (range) {
          const a = range[1] ? Number(range[1]) : 0;
          const b = range[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
          res.writeHead(206, { "Content-Type": "audio/wav", "Accept-Ranges": "bytes", "Content-Range": `bytes ${a}-${b}/${wav.length}`, "Content-Length": b - a + 1 });
          return res.end(wav.subarray(a, b + 1));
        }
        res.writeHead(200, { "Content-Type": "audio/wav", "Accept-Ranges": "bytes", "Content-Length": wav.length });
        return res.end(wav);
      }
      let body: Record<string, unknown> = {};
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        if (text) body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return send(res, 400, { error: { code: "bad_request", message: "invalid JSON body" } });
      }
      try {
        const path = url.pathname;
        const method = req.method ?? "GET";
        if (method === "POST" && path === "/v1/admin/auth/login" && opts.adminLoginMissing) throw new HttpErr(opts.adminLoginMissing === "unauthorized" ? 401 : 404, opts.adminLoginMissing === "unauthorized" ? "unauthorized" : "not_found", "missing bearer token");
        if (method === "POST" && (path === "/v1/admin/auth/login" || path === "/v1/auth/login")) {
          const email = String(body.email ?? "").toLowerCase();
          const ip = entry.xff ?? req.socket.remoteAddress ?? "?";
          if (failHit(`e:${email}`, 5) || failHit(`i:${ip}`, 20)) throw new HttpErr(429, "too_many_attempts", "too many attempts", { "Retry-After": "900" });
          const u = state.users.find((x) => x.email === email);
          const good = u && ((u.email === MOCK_ADMIN_EMAIL && body.password === MOCK_ADMIN_PASSWORD) || (u.email === MOCK_USER_EMAIL && body.password === MOCK_USER_PASSWORD));
          if (!good || u!.ban) {
            failAdd(`e:${email}`);
            failAdd(`i:${ip}`);
            throw new HttpErr(401, "invalid_credentials", "invalid email or password");
          }
          if (path === "/v1/admin/auth/login" && u!.role !== "admin") {
            failAdd(`e:${email}`);
            throw new HttpErr(401, "invalid_credentials", "invalid email or password");
          }
          const pair = issue(u!.id);
          u!.lastSeenAt = new Date().toISOString();
          return send(res, 200, { user: userOut(u!), ...pair });
        }
        if (method === "POST" && path === "/v1/auth/refresh") {
          const t = refresh.get(String(body.refreshToken ?? ""));
          if (!t || t.revoked) throw new HttpErr(401, "invalid_token", "invalid or expired token");
          t.revoked = true;
          const u = getUser(t.userId);
          if (!u || u.ban) throw new HttpErr(403, "account_banned", "this account is banned");
          return send(res, 200, issue(t.userId));
        }
        if (method === "POST" && path === "/v1/auth/logout") {
          const t = refresh.get(String(body.refreshToken ?? ""));
          if (t) t.revoked = true;
          return send(res, 204);
        }
        // everything else needs a bearer token
        const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
        const tok = access.get(bearer);
        if (!tok || tok.exp < Date.now()) throw new HttpErr(401, "unauthorized", "invalid or expired access token");
        const actor = getUser(tok.userId);
        if (!actor) throw new HttpErr(401, "unauthorized", "invalid or expired access token");
        if (actor.ban) throw new HttpErr(403, "account_banned", "this account is banned");
        if (method === "GET" && path === "/v1/genres") {
          return send(res, 200, { genres: ["Pop", "Hip-Hop/Rap", "Afrobeats", "R&B/Soul", "Amapiano", "Dancehall", "Gospel", "Reggae", "Bongo Flava", "Other"].map((name) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name })) });
        }
        if (method === "POST" && path === "/v1/images") {
          const size = Number(body.sizeBytes);
          need(body.purpose === "cover" || body.purpose === "avatar", 422, "validation_error", "purpose must be avatar or cover");
          need(size >= 1 && size <= 10 << 20, 422, "validation_error", "sizeBytes must be between 1 byte and 10 MB");
          const id = "img_" + randomBytes(12).toString("hex");
          images.set(id, { owner: actor.id, size: 0, ready: false });
          return send(res, 201, { id, purpose: body.purpose, status: "pending", upload: { method: "PUT", url: `http://127.0.0.1:${listenPort}/mock-storage/${id}`, expiresAt: new Date(Date.now() + 3_600_000).toISOString() } });
        }
        const imgDone = path.match(/^\/v1\/images\/(img_[a-z0-9]+)\/complete$/);
        if (method === "POST" && imgDone) {
          const im = images.get(imgDone[1]!);
          if (!im || im.owner !== actor.id) throw new HttpErr(404, "not_found", "image not found");
          if (im.size < 1) throw new HttpErr(409, "not_uploaded", "the file has not been uploaded yet");
          im.ready = true;
          return send(res, 200, { id: imgDone[1], purpose: "cover", status: "ready", width: 400, height: 400, urls: { small: mediaUrl(imgDone[1]!, "small"), medium: mediaUrl(imgDone[1]!), large: mediaUrl(imgDone[1]!, "large") } });
        }
        const pb = path.match(/^\/v1\/playback\/(trk_[A-Za-z0-9_]+)$/);
        if (method === "GET" && pb) {
          const tr = state.tracks.find((x) => x.id === pb[1]);
          if (!tr || !trackPublic(tr)) throw new HttpErr(404, "not_found", "track not found");
          return send(res, 200, { trackId: tr.id, source: "native", playback: { mode: "url", url: `http://127.0.0.1:${listenPort}/mock-audio/${tr.id}.wav`, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), quality: url.searchParams.get("quality") ?? "medium" } });
        }
        if (method === "GET" && path === "/v1/search") {
          const term = (url.searchParams.get("q") ?? "").toLowerCase();
          if (!term) throw new HttpErr(400, "bad_request", "q is required");
          const tracksOut = state.tracks
            .filter((t) => trackPublic(t) && t.title.toLowerCase().includes(term))
            .slice(0, Number(url.searchParams.get("limit")) || 20)
            .map((t) => {
              const rel = state.releases.find((r) => r.id === t.releaseId)!;
              return { id: t.id, title: t.title, artistName: state.artists.find((a) => a.id === rel.artistId)?.name, albumTitle: rel.title, durationMs: t.durationMs };
            });
          return send(res, 200, { tracks: tracksOut });
        }
        if (!path.startsWith("/v1/admin/")) throw new HttpErr(404, "not_found", "not found");
        if (actor.role !== "admin") throw new HttpErr(403, "forbidden", "administrators only");
        const out = routes(req, url, body, actor);
        return send(res, out.status, out.data);
      } catch (e) {
        if (e instanceof HttpErr) return send(res, e.status, { error: { code: e.code, message: e.message } }, e.headers);
        return send(res, 500, { error: { code: "internal", message: String(e) } });
      }
    });
  });

  return {
    server,
    log,
    state: new Proxy({} as Mock["state"], {
      get: (_t, k: string) => (state as Record<string, unknown>)[k],
    }),
    listen: (port) =>
      new Promise((resolve) => {
        server.listen(port, "127.0.0.1", () => {
          const addr = server.address();
          listenPort = typeof addr === "object" && addr ? addr.port : port;
          resolve(listenPort);
        });
      }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
