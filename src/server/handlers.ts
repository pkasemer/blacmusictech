// Request handlers behind the thin route files in src/app/api. They take a standard Request and return a
// standard Response (cookies are read from and written to headers), so tests can call them directly.

import { z } from "zod";
import { openPart, sealPart } from "./part-token";
import { backendFetch, errorCode, refreshTokens, revokeRefresh, type TokenPair } from "./backend";
import { getConfig } from "./config";
import { clientIp, csrfOk, isUnsafeMethod, originOk, Throttle } from "./guard";
import {
  clearCookie,
  newSession,
  sessionCookie,
  sessionFromRequest,
  TOUCH_INTERVAL_MS,
  type Session,
} from "./session";

const MAX_BODY = 1 << 20;

export const loginByIp = new Throttle(30, 15 * 60_000);
export const loginByEmail = new Throttle(10, 15 * 60_000);

function json(status: number, body: unknown, cookies: string[] = [], extra: Record<string, string> = {}): Response {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", ...extra });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

function fail(status: number, code: string, message: string, cookies: string[] = [], extra: Record<string, string> = {}): Response {
  return json(status, { error: { code, message } }, cookies, extra);
}

const GENERIC_LOGIN_ERROR = "Invalid email or password.";

const loginBody = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(200),
});

interface LoginUser {
  id: string;
  email: string;
  displayName?: string;
  role?: string;
}
interface LoginResponse extends TokenPair {
  user: LoginUser;
}

/** POST /api/auth/login */
export async function handleLogin(req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Method not allowed");
  if (!originOk(req)) return fail(403, "bad_origin", "Request origin not allowed");

  let parsed: z.infer<typeof loginBody>;
  try {
    const text = await req.text();
    if (text.length > 4096) return fail(413, "too_large", "Request too large");
    const r = loginBody.safeParse(JSON.parse(text));
    if (!r.success) return fail(400, "bad_request", "Enter your email and password.");
    parsed = r.data;
  } catch {
    return fail(400, "bad_request", "Enter your email and password.");
  }

  const email = parsed.email.toLowerCase();
  const ip = clientIp(req);
  const wait = Math.max(loginByIp.hit(`ip:${ip ?? "?"}`), loginByEmail.hit(`email:${email}`));
  if (wait > 0) {
    return fail(429, "too_many_attempts", "Too many sign-in attempts. Try again later.", [], { "Retry-After": String(wait) });
  }

  let res: Response;
  try {
    res = await backendFetch("/v1/admin/auth/login", { method: "POST", body: JSON.stringify({ email, password: parsed.password }), ip });
    // Until the Backend ships POST /v1/admin/auth/login the path falls into its authenticated group and
    // answers 401 "unauthorized" (missing bearer token), or 404 later on. Only that triggers the dev stopgap,
    // never a real "invalid_credentials".
    if (getConfig().loginFallback && (res.status === 404 || (res.status === 401 && (await errorCode(res.clone())) === "unauthorized"))) {
      res = await backendFetch("/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password: parsed.password }), ip });
    }
  } catch {
    return fail(502, "backend_unavailable", "The server is not reachable. Try again.");
  }

  if (res.status === 429) {
    const retry = res.headers.get("retry-after") ?? "60";
    return fail(429, "too_many_attempts", "Too many sign-in attempts. Try again later.", [], { "Retry-After": retry });
  }
  if (res.status === 401 || res.status === 403 || res.status === 422 || res.status === 400) {
    return fail(401, "invalid_credentials", GENERIC_LOGIN_ERROR);
  }
  if (!res.ok) return fail(502, "backend_unavailable", "The server is not reachable. Try again.");

  let data: LoginResponse;
  try {
    data = (await res.json()) as LoginResponse;
  } catch {
    return fail(502, "bad_response", "Unexpected response from the server.");
  }
  // Admin accounts only, whatever the Backend answered. A non-admin gets the same error as a wrong
  // password and the tokens that were just issued are revoked.
  if (!data.accessToken || !data.refreshToken || !data.user?.id || data.user.role !== "admin") {
    if (data.refreshToken) await revokeRefresh(data.refreshToken);
    return fail(401, "invalid_credentials", GENERIC_LOGIN_ERROR);
  }

  loginByEmail.reset(`email:${email}`);
  const session = newSession({
    access: data.accessToken,
    accessExp: Date.parse(data.expiresAt) || Date.now() + 10 * 60_000,
    refresh: data.refreshToken,
    user: { id: data.user.id, email: data.user.email, displayName: data.user.displayName ?? data.user.email },
  });
  return json(200, { user: session.user, csrf: session.csrf }, [await sessionCookie(session)]);
}

/** GET /api/auth/session: who is signed in, plus the CSRF token for the page. */
export async function handleSession(req: Request): Promise<Response> {
  const s = await sessionFromRequest(req);
  if (!s) return fail(401, "unauthorized", "Not signed in", [clearCookie()]);
  const cookies: string[] = [];
  if (Date.now() - s.lastSeen > TOUCH_INTERVAL_MS) cookies.push(await sessionCookie({ ...s, lastSeen: Date.now() }));
  return json(200, { user: s.user, csrf: s.csrf }, cookies);
}

/** POST /api/auth/logout */
export async function handleLogout(req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Method not allowed");
  if (!originOk(req)) return fail(403, "bad_origin", "Request origin not allowed");
  const s = await sessionFromRequest(req);
  if (s) {
    if (!csrfOk(req, s)) return fail(403, "bad_csrf", "Invalid request token");
    await revokeRefresh(s.refresh);
  }
  return json(204, undefined, [clearCookie()]);
}

const SEGMENT = /^[A-Za-z0-9._~-]{1,128}$/;

/** Maps the catch-all path of /api/admin/* to the Backend path, or null when it is not acceptable. */
export function adminBackendPath(segments: string[]): string | null {
  if (segments.length === 0 || segments.length > 8) return null;
  for (const s of segments) {
    if (!SEGMENT.test(s) || s === "." || s === "..") return null;
  }
  return `/v1/admin/${segments.join("/")}`;
}

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

async function readBody(req: Request): Promise<string | undefined | "too_large"> {
  if (req.method === "GET") return undefined;
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY) return "too_large";
  const text = await req.text();
  if (text.length > MAX_BODY) return "too_large";
  return text === "" ? undefined : text;
}

/**
 * An authenticated conversation with the Backend on behalf of the signed-in administrator: checks the session
 * (and, for state changes, the Origin and CSRF token), keeps the access token fresh, retries once when the
 * Backend refuses it, and works out the cookie the answer must carry.
 */
class BackendSession {
  private changed = false;
  get sid(): string {
    return this.s.sid;
  }
  constructor(
    private s: Session,
    private ip: string | undefined,
  ) {}

  /** Opens the session for a request, or returns the error response to send. */
  static async open(req: Request): Promise<BackendSession | Response> {
    const s = await sessionFromRequest(req);
    if (!s) return fail(401, "unauthorized", "Please sign in again.", [clearCookie()]);
    if (isUnsafeMethod(req.method)) {
      if (!originOk(req)) return fail(403, "bad_origin", "Request origin not allowed");
      if (!csrfOk(req, s)) return fail(403, "bad_csrf", "Invalid request token");
    }
    const bs = new BackendSession(s, clientIp(req));
    if (s.accessExp - Date.now() < 30_000) {
      const failed = await bs.refresh();
      if (failed) return failed;
    }
    return bs;
  }

  private async refresh(): Promise<Response | null> {
    const r = await refreshTokens(this.s.refresh, this.ip);
    if (!r.ok) {
      if (r.status === 502) return fail(502, "backend_unavailable", "The server is not reachable. Try again.");
      return fail(401, "session_expired", "Your session has ended. Please sign in again.", [clearCookie()]);
    }
    this.changed = true;
    this.s = {
      ...this.s,
      access: r.pair.accessToken,
      refresh: r.pair.refreshToken,
      accessExp: Date.parse(r.pair.expiresAt) || Date.now() + 10 * 60_000,
    };
    return null;
  }

  /** Calls the Backend; a refused token is rotated once and the call repeated (a 401 means nothing ran). */
  async call(path: string, o: { method?: string; body?: string } = {}): Promise<Response | { response: Response }> {
    try {
      let res = await backendFetch(path, { method: o.method, body: o.body, token: this.s.access, ip: this.ip });
      if (res.status === 401) {
        const failed = await this.refresh();
        if (failed) return { response: failed };
        res = await backendFetch(path, { method: o.method, body: o.body, token: this.s.access, ip: this.ip });
      }
      return res;
    } catch {
      return { response: fail(502, "backend_unavailable", "The server is not reachable. Try again.") };
    }
  }

  /** Cookies for the answer: cleared when the account lost its rights, refreshed when tokens rotated or time passed. */
  async cookies(status: number, code?: string): Promise<string[]> {
    if (status === 401 || (status === 403 && (code === "forbidden" || code === "account_banned"))) return [clearCookie()];
    if (this.changed || Date.now() - this.s.lastSeen > TOUCH_INTERVAL_MS) return [await sessionCookie({ ...this.s, lastSeen: Date.now() })];
    return [];
  }

  /** Reads a Backend JSON answer and turns it into the response for the browser. */
  async reply(res: Response): Promise<Response> {
    const text = res.status === 204 ? "" : await res.text();
    let parsed: unknown;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // The Backend answers a route it does not have with a plain-text 404. Say so, instead of a vague 502.
        if (res.status === 404) return fail(404, "not_available", "This feature is not available on the server yet.");
        return fail(502, "bad_response", "Unexpected response from the server.");
      }
    }
    const code = (parsed as { error?: { code?: string } } | undefined)?.error?.code;
    const extra: Record<string, string> = {};
    const retry = res.headers.get("retry-after");
    if (retry) extra["Retry-After"] = retry;
    return json(res.status, parsed, await this.cookies(res.status, code), extra);
  }
}

/**
 * Forwards an authenticated request to the Backend with the session's bearer token.
 * `backendPath` must already be validated by the caller; `query` is passed through as given.
 */
export async function proxyToBackend(req: Request, backendPath: string, query: string): Promise<Response> {
  if (!ALLOWED_METHODS.has(req.method)) return fail(405, "method_not_allowed", "Method not allowed");
  const bs = await BackendSession.open(req);
  if (bs instanceof Response) return bs;
  const body = await readBody(req);
  if (body === "too_large") return fail(413, "too_large", "Request too large");
  const res = await bs.call(`${backendPath}${query}`, { method: req.method, body });
  if ("response" in res) return res.response;
  return bs.reply(res);
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE = 10 << 20; // the Backend's limit

/**
 * POST /api/images?purpose=cover|avatar : upload a cover (playlist or release) or an artist picture. The browser sends the raw image; this server asks the Backend for an
 * upload slot, puts the bytes there, and asks the Backend to validate and re-encode them. The storage address comes
 * from the Backend's own answer, never from the browser, and the browser never needs to reach the storage host.
 */
export async function handleImageUpload(req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Method not allowed");
  const bs = await BackendSession.open(req);
  if (bs instanceof Response) return bs;
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!IMAGE_TYPES.has(type)) return fail(415, "unsupported_type", "Use a JPEG, PNG or WebP image.");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_IMAGE) return fail(413, "too_large", "The image must be 10 MB or smaller.");
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length < 1) return fail(400, "bad_request", "No image received.");
  if (bytes.length > MAX_IMAGE) return fail(413, "too_large", "The image must be 10 MB or smaller.");

  const asked = new URL(req.url).searchParams.get("purpose");
  const purpose = asked === "avatar" ? "avatar" : "cover";
  const created = await bs.call("/v1/images", { method: "POST", body: JSON.stringify({ purpose, sizeBytes: bytes.length }) });
  if ("response" in created) return created.response;
  if (created.status !== 201) return bs.reply(created);
  const slot = (await created.json()) as { id?: string; upload?: { method?: string; url?: string } };
  const target = slot.upload?.url;
  if (!slot.id || !/^img_[a-z0-9]+$/.test(slot.id) || !target || slot.upload?.method !== "PUT") {
    return fail(502, "bad_response", "Unexpected response from the server.");
  }
  let storageUrl: URL;
  try {
    storageUrl = new URL(target);
    if (storageUrl.protocol !== "https:" && storageUrl.protocol !== "http:") throw new Error("scheme");
  } catch {
    return fail(502, "bad_response", "Unexpected response from the server.");
  }

  try {
    const put = await fetch(storageUrl, { method: "PUT", body: bytes, redirect: "manual", signal: AbortSignal.timeout(60_000) });
    if (!put.ok) return fail(502, "upload_failed", "The image could not be stored. Try again.");
  } catch {
    return fail(502, "upload_failed", "The image could not be stored. Try again.");
  }

  const done = await bs.call(`/v1/images/${slot.id}/complete`, { method: "POST" });
  if ("response" in done) return done.response;
  return bs.reply(done);
}

const TRACK_ID = /^trk_[A-Za-z0-9]{1,64}$/;

/** GET /api/playback/{trackId}?quality= : a short-lived link to play a track in the admin player. */
export async function handlePlayback(req: Request, trackId: string): Promise<Response> {
  if (req.method !== "GET") return fail(405, "method_not_allowed", "Method not allowed");
  if (!TRACK_ID.test(trackId)) return fail(404, "not_found", "Not found");
  const q = new URL(req.url).searchParams.get("quality");
  const quality = q === "low" || q === "high" ? q : "medium";
  return proxyToBackend(req, `/v1/playback/${trackId}`, `?quality=${quality}`);
}

/** /api/admin/[...path] */
export async function handleAdminProxy(req: Request, segments: string[]): Promise<Response> {
  const path = adminBackendPath(segments);
  if (!path) return fail(404, "not_found", "Not found");
  return proxyToBackend(req, path, new URL(req.url).search);
}

/** /api/search?q= : the track picker for editorial playlists. Only q and limit are forwarded. */
export async function handleSearch(req: Request): Promise<Response> {
  if (req.method !== "GET") return fail(405, "method_not_allowed", "Method not allowed");
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q || q.length > 100) return fail(400, "bad_request", "q is required");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "20") || 20, 1), 50);
  return proxyToBackend(req, "/v1/search", `?q=${encodeURIComponent(q)}&limit=${limit}`);
}

// ------------------------------------------------------------------ audio uploads

const RELEASE_ID = /^alb_[A-Za-z0-9_]{1,64}$/;
const UPLOAD_ID = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_AUDIO = 2 * 1024 ** 3; // the Backend's own limit applies on top
const MAX_PART = 16 * 1024 * 1024 + 1024;

const uploadBody = z.object({
  releaseId: z.string().regex(RELEASE_ID),
  title: z.string().trim().min(1).max(200),
  genre: z.string().trim().max(60).optional(),
  trackNumber: z.number().int().min(1).max(999).optional(),
  explicit: z.boolean().optional(),
  filename: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().min(1).max(MAX_AUDIO),
  rightsConfirmed: z.literal(true),
});

interface BackendTarget {
  type?: string;
  url?: string;
  partSize?: number;
  partCount?: number;
  parts?: { number: number; url: string }[];
  expiresAt?: string;
}

/** Turns the Backend's presigned targets into sealed tokens the browser can hand back, never raw storage addresses. */
async function sealTargets(sid: string, t: BackendTarget, sizeBytes: number, only?: number[]): Promise<{ number: number; token: string }[] | null> {
  const expires = new Date(t.expiresAt ?? "");
  if (t.type === "single" || (!t.parts && t.url)) {
    if (!t.url) return null;
    return [{ number: 1, token: await sealPart(sid, { url: t.url, size: sizeBytes, exact: false }, expires) }];
  }
  const partSize = t.partSize ?? 0;
  const count = t.partCount ?? 0;
  if (!t.parts || partSize < 1 || count < 1) return null;
  const out: { number: number; token: string }[] = [];
  for (const p of t.parts) {
    if (only && !only.includes(p.number)) continue;
    const size = p.number === count ? sizeBytes - partSize * (count - 1) : partSize;
    if (size < 1 || p.number < 1 || p.number > count) return null;
    out.push({ number: p.number, token: await sealPart(sid, { url: p.url, size, exact: true }, expires) });
  }
  return out;
}

/** POST /api/uploads : start uploading one audio file to a release. Returns sealed part tokens. */
export async function handleUploadCreate(req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Method not allowed");
  const bs = await BackendSession.open(req);
  if (bs instanceof Response) return bs;
  let b: z.infer<typeof uploadBody>;
  try {
    const r = uploadBody.safeParse(JSON.parse(await req.text()));
    if (!r.success) return fail(422, "validation_error", "Check the track details and confirm you have the rights to upload it.");
    b = r.data;
  } catch {
    return fail(400, "bad_request", "Invalid request.");
  }
  const { releaseId, ...rest } = b;
  const res = await bs.call(`/v1/admin/releases/${releaseId}/uploads`, { method: "POST", body: JSON.stringify(rest) });
  if ("response" in res) return res.response;
  if (res.status !== 201) return bs.reply(res);
  const view = (await res.json()) as { id?: string; status?: string; upload?: BackendTarget; maxBytes?: number };
  if (!view.id || !UPLOAD_ID.test(view.id) || !view.upload) return fail(502, "bad_response", "Unexpected response from the server.");
  const sid = bsSid(bs);
  const parts = await sealTargets(sid, view.upload, b.sizeBytes);
  if (!parts) return fail(502, "bad_response", "Unexpected response from the server.");
  const out = { id: view.id, status: view.status ?? "pending", plan: { type: view.upload.type === "multipart" ? "multipart" : "single", partSize: view.upload.partSize, partCount: parts.length, parts } };
  return json(201, out, await bs.cookies(201));
}

/** GET /api/uploads/{id}/parts?size= : what is still missing for a resumable upload, with fresh sealed tokens. */
export async function handleUploadParts(req: Request, id: string): Promise<Response> {
  if (req.method !== "GET") return fail(405, "method_not_allowed", "Method not allowed");
  if (!UPLOAD_ID.test(id)) return fail(404, "not_found", "Not found");
  const size = Number(new URL(req.url).searchParams.get("size"));
  if (!Number.isInteger(size) || size < 1 || size > MAX_AUDIO) return fail(400, "bad_request", "size is required");
  const bs = await BackendSession.open(req);
  if (bs instanceof Response) return bs;
  const res = await bs.call(`/v1/admin/uploads/${id}/parts`);
  if ("response" in res) return res.response;
  if (res.status !== 200) return bs.reply(res);
  const v = (await res.json()) as BackendTarget & { uploaded?: number[] };
  // the total number of parts comes from the file size: the Backend's own count may only cover what is still missing
  const total = v.partSize && v.partSize > 0 ? Math.ceil(size / v.partSize) : 0;
  const parts = await sealTargets(bsSid(bs), { ...v, type: "multipart", partCount: total }, size);
  if (!parts) return fail(502, "bad_response", "Unexpected response from the server.");
  return json(200, { partSize: v.partSize, partCount: v.partCount, uploaded: v.uploaded ?? [], parts }, await bs.cookies(200));
}

/**
 * PUT /api/uploads/part?token= : sends one part (raw bytes, streamed, never held in memory) to the presigned
 * storage URL sealed in the token. The size must match what the token allows.
 */
export async function handleUploadPart(req: Request): Promise<Response> {
  if (req.method !== "PUT") return fail(405, "method_not_allowed", "Method not allowed");
  const bs = await BackendSession.open(req);
  if (bs instanceof Response) return bs;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const claim = await openPart(token, bsSid(bs));
  if (!claim) return fail(403, "bad_token", "This upload link is not valid any more. Start the upload again.");
  const len = Number(req.headers.get("content-length") ?? "");
  if (!Number.isInteger(len) || len < 1 || len > MAX_PART) return fail(411, "length_required", "The part size is missing or too large.");
  if (claim.exact ? len !== claim.size : len > claim.size) return fail(422, "wrong_size", "This part is not the size the upload expects.");
  if (!req.body) return fail(400, "bad_request", "No data received.");
  try {
    const put = await fetch(claim.url, {
      method: "PUT",
      body: req.body,
      headers: { "Content-Length": String(len) },
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
      // streams the request body straight through
      duplex: "half",
    } as RequestInit);
    if (!put.ok) return fail(502, "upload_failed", "The audio could not be stored. Try again.");
  } catch {
    return fail(502, "upload_failed", "The audio could not be stored. Try again.");
  }
  return json(204, undefined, await bs.cookies(204));
}

/** GET /api/genres : the genres a release may use. */
export async function handleGenres(req: Request): Promise<Response> {
  if (req.method !== "GET") return fail(405, "method_not_allowed", "Method not allowed");
  return proxyToBackend(req, "/v1/genres", "");
}

const bsSid = (bs: { sid: string }): string => bs.sid;
