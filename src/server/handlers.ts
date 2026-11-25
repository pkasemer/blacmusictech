// Request handlers behind the thin route files in src/app/api. They take a standard Request and return a
// standard Response (cookies are read from and written to headers), so tests can call them directly.

import { z } from "zod";
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
 * Forwards an authenticated request to the Backend with the session's bearer token.
 * `backendPath` must already be validated by the caller; `query` is passed through as given.
 */
export async function proxyToBackend(req: Request, backendPath: string, query: string): Promise<Response> {
  if (!ALLOWED_METHODS.has(req.method)) return fail(405, "method_not_allowed", "Method not allowed");
  let s = await sessionFromRequest(req);
  if (!s) return fail(401, "unauthorized", "Please sign in again.", [clearCookie()]);
  if (isUnsafeMethod(req.method)) {
    if (!originOk(req)) return fail(403, "bad_origin", "Request origin not allowed");
    if (!csrfOk(req, s)) return fail(403, "bad_csrf", "Invalid request token");
  }
  const body = await readBody(req);
  if (body === "too_large") return fail(413, "too_large", "Request too large");

  const ip = clientIp(req);
  let changed = false;

  const refresh = async (cur: Session): Promise<Session | Response> => {
    const r = await refreshTokens(cur.refresh, ip);
    if (!r.ok) {
      if (r.status === 502) return fail(502, "backend_unavailable", "The server is not reachable. Try again.");
      return fail(401, "session_expired", "Your session has ended. Please sign in again.", [clearCookie()]);
    }
    changed = true;
    return { ...cur, access: r.pair.accessToken, refresh: r.pair.refreshToken, accessExp: Date.parse(r.pair.expiresAt) || Date.now() + 10 * 60_000 };
  };

  if (s.accessExp - Date.now() < 30_000) {
    const r = await refresh(s);
    if (r instanceof Response) return r;
    s = r;
  }

  const call = async (token: string): Promise<Response> =>
    backendFetch(`${backendPath}${query}`, { method: req.method, token, body, ip });

  let res: Response;
  try {
    res = await call(s.access);
    if (res.status === 401) {
      // The access token was refused (e.g. clock skew): rotate once and retry. A 401 means nothing ran.
      const r = await refresh(s);
      if (r instanceof Response) return r;
      s = r;
      res = await call(s.access);
    }
  } catch {
    return fail(502, "backend_unavailable", "The server is not reachable. Try again.");
  }

  const cookies: string[] = [];
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

  // An account that lost its admin role or was banned must not keep a working session.
  const code = (parsed as { error?: { code?: string } } | undefined)?.error?.code;
  if (res.status === 401 || (res.status === 403 && (code === "forbidden" || code === "account_banned"))) {
    cookies.push(clearCookie());
  } else if (changed || Date.now() - s.lastSeen > TOUCH_INTERVAL_MS) {
    cookies.push(await sessionCookie({ ...s, lastSeen: Date.now() }));
  }

  const extra: Record<string, string> = {};
  const retry = res.headers.get("retry-after");
  if (retry) extra["Retry-After"] = retry;
  return json(res.status, parsed, cookies, extra);
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
