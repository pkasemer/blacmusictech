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
interface Playlist {
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
  state: { users: User[]; artists: Artist[]; releases: Release[]; tracks: Track[]; playlists: Playlist[]; audit: Audit[] };
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
        tracks.push({ id: `trk_${id.slice(4)}_${t}`, releaseId: id, title: `${pick(WORDS)} ${pick(WORDS)}`, trackNumber: t + 1, durationMs: 120_000 + Math.floor(r() * 150_000), explicit: r() > 0.85, genre: rel.genre });
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
  return { users, artists, releases, tracks, playlists, audit };
}

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
      id: a.id, name: a.name, verification: a.verification, flagged: a.flagged, banned: !!a.ban || !!owner?.ban,
      ownerUserId: a.ownerUserId, ownerEmail: owner?.email,
      releaseCount: state.releases.filter((r) => r.artistId === a.id).length, followerCount: a.followerCount, createdAt: a.createdAt,
      verificationMessage: a.verificationMessage || undefined, requestedAt: a.requestedAt,
    };
  };
  const releaseRow = (r: Release) => {
    const a = state.artists.find((x) => x.id === r.artistId);
    return {
      id: r.id, title: r.title, type: r.type, artistId: r.artistId, artistName: a?.name ?? "", visibility: r.visibility, takenDown: !!r.takedown,
      trackCount: releaseTracks(r.id).length, publishedAt: r.publishedAt, createdAt: r.createdAt,
    };
  };
  const trackPublic = (t: Track) => {
    const rel = state.releases.find((r) => r.id === t.releaseId);
    return rel?.visibility === "public";
  };
  const playlistRow = (p: Playlist) => ({
    id: p.id, name: p.name, description: p.description, isPublic: p.isPublic, isFeatured: p.isFeatured, trackCount: p.trackIds.length, updatedAt: p.updatedAt,
    groups: p.isFeatured ? ["Home"] : [],
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

  const routes = (req: IncomingMessage, url: URL, body: Record<string, unknown>, actor: User): { status: number; data?: unknown } => {
    const m = req.method ?? "GET";
    const p = url.pathname.replace(/^\/v1\/admin/, "");
    const q = url.searchParams;
    let mt: RegExpMatchArray | null;
    const ok = (data: unknown, status = 200) => ({ status, data });
    const none = { status: 204 } as const;

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
      need(["signups", "artists", "releases", "plays"].includes(metric), 400, "bad_request", "unknown metric");
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
    if ((mt = p.match(/^\/users\/([^/]+)$/)) && m === "GET") {
      const u = getUser(mt[1]!);
      need(u, 404, "not_found", "user not found");
      const a = artistOfUser(u!.id);
      return ok({
        id: u!.id, email: u!.email, displayName: u!.displayName, role: u!.role, emailVerified: u!.emailVerified, banned: !!u!.ban, hasArtist: !!a, createdAt: u!.createdAt,
        ban: u!.ban ? { at: u!.ban.at, reason: u!.ban.reason, by: u!.ban.by === "usr_admin" ? { id: "usr_admin", email: MOCK_ADMIN_EMAIL } : null } : null, signIn: { password: u!.methods.includes("password"), apple: u!.methods.includes("apple"), google: u!.methods.includes("google") }, artist: a ? { id: a.id, name: a.name } : null, counts: { playlists: 2, followedArtists: 5, savedItems: 14 }, lastSeenAt: u!.lastSeenAt ?? null, pushEnabled: u!.id.endsWith("3"),
      });
    }
    if ((mt = p.match(/^\/users\/([^/]+)\/(ban|unban|deletion-preview)$/)) && (m === "POST" || m === "GET")) {
      const u = getUser(mt[1]!);
      need(u, 404, "not_found", "user not found");
      const op = mt[2];
      if (op === "deletion-preview" && m === "GET") {
        const a = artistOfUser(u!.id);
        const rels = a ? state.releases.filter((r) => r.artistId === a.id) : [];
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
      if (a) removeArtist(a.id);
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
        id: a!.id, name: a!.name, bio: a!.bio,
        verification: { state: a!.verification, message: a!.verificationMessage, note: a!.verificationNote, requestedAt: a!.requestedAt ?? null },
        flagged: a!.flagged, ban: a!.ban, owner: owner ? { id: owner.id, email: owner.email, displayName: owner.displayName } : null,
        storage: { usedBytes: a!.usedBytes, quotaBytes: a!.quotaBytes },
        counts: { releases: rels.length, publicReleases: rels.filter((r) => r.visibility === "public").length, tracks: rels.reduce((s, r) => s + releaseTracks(r.id).length, 0), followers: a!.followerCount, plays: a!.followerCount * 9 },
        recentGrants: [...a!.grants].reverse().slice(0, 10), createdAt: a!.createdAt,
      });
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
      need(d === "approve" || d === "reject" || d === "revoke", 400, "bad_request", "decision must be approve, reject or revoke");
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (d === "approve") {
        need(a!.verification === "pending", 409, "not_pending", "no pending verification request");
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

    // --------------------------------------------------------- releases
    if (m === "GET" && p === "/releases") {
      const term = (q.get("q") ?? "").toLowerCase();
      let rows = state.releases.filter((r) => !term || r.title.toLowerCase().includes(term) || (state.artists.find((a) => a.id === r.artistId)?.name ?? "").toLowerCase().includes(term));
      if (q.get("visibility")) rows = rows.filter((r) => r.visibility === q.get("visibility"));
      if (q.get("takenDown") === "true") rows = rows.filter((r) => r.takedown);
      if (q.get("takenDown") === "false") rows = rows.filter((r) => !r.takedown);
      if (q.get("artistId")) rows = rows.filter((r) => r.artistId === q.get("artistId"));
      if (q.get("type")) rows = rows.filter((r) => r.type === q.get("type"));
      rows = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const pg = pageOf(rows, q);
      return ok({ total: pg.total, releases: pg.rows.map(releaseRow) });
    }
    if ((mt = p.match(/^\/releases\/([^/]+)$/)) && m === "GET") {
      const r = state.releases.find((x) => x.id === mt![1]);
      need(r, 404, "not_found", "release not found");
      return ok({ ...releaseRow(r!), description: r!.description, genre: r!.genre, takedownReason: r!.takedown?.reason, takenDownAt: r!.takedown?.at, tracks: releaseTracks(r!.id).map((t) => ({ id: t.id, title: t.title, trackNumber: t.trackNumber, durationMs: t.durationMs, visibility: r!.visibility === "public" ? "public" : "draft", explicit: t.explicit, genre: t.genre })) });
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
        pl!.updatedAt = new Date().toISOString();
        addAudit(actor, "playlist.update", "playlist", pl!.id, pl!.name, "", { fields: Object.keys(body) });
        return ok({ ...playlistRow(pl!), items: playlistItems(pl!) });
      }
      if (m === "DELETE") {
        state.playlists.splice(state.playlists.indexOf(pl!), 1);
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
          resolve(typeof addr === "object" && addr ? addr.port : port);
        });
      }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
