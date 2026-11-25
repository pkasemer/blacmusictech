// The only place that talks to the Blac Music API. Server side only.

import { getConfig } from "./config";

export interface TokenPair {
  accessToken: string;
  expiresAt: string;
  refreshToken: string;
}

export interface BackendCall {
  method?: string;
  token?: string;
  body?: string;
  /** The visitor's address, forwarded so the Backend's per-IP lockout sees them, not this server. */
  ip?: string;
}

/** Calls the Backend. Never follows redirects, always times out. */
export async function backendFetch(path: string, call: BackendCall = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (call.token) headers.Authorization = `Bearer ${call.token}`;
  if (call.body !== undefined) headers["Content-Type"] = "application/json";
  if (call.ip) headers["X-Forwarded-For"] = call.ip;
  return fetch(`${getConfig().backendUrl}${path}`, {
    method: call.method ?? "GET",
    headers,
    body: call.body,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

export type RefreshResult =
  | { ok: true; pair: TokenPair }
  | { ok: false; status: number; code: string };

const inflight = new Map<string, Promise<RefreshResult>>();

/**
 * Rotates a refresh token. Refresh tokens are single use, so parallel requests that carry the same
 * cookie must share one rotation; the result is kept for a few seconds for late arrivals.
 */
export function refreshTokens(refresh: string, ip?: string): Promise<RefreshResult> {
  const existing = inflight.get(refresh);
  if (existing) return existing;
  const p = doRefresh(refresh, ip);
  inflight.set(refresh, p);
  const t = setTimeout(() => inflight.delete(refresh), 15_000);
  t.unref?.();
  return p;
}

async function doRefresh(refresh: string, ip?: string): Promise<RefreshResult> {
  try {
    const res = await backendFetch("/v1/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: refresh }), ip });
    if (!res.ok) {
      return { ok: false, status: res.status, code: await errorCode(res) };
    }
    const pair = (await res.json()) as TokenPair;
    if (!pair.accessToken || !pair.refreshToken) return { ok: false, status: 502, code: "bad_response" };
    return { ok: true, pair };
  } catch {
    return { ok: false, status: 502, code: "backend_unavailable" };
  }
}

export async function errorCode(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { code?: string } };
    return j.error?.code ?? "error";
  } catch {
    return "error";
  }
}

/** Best effort: the sign-out must work even when the Backend is down. */
export async function revokeRefresh(refresh: string): Promise<void> {
  try {
    await backendFetch("/v1/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken: refresh }) });
  } catch {
    /* ignore */
  }
}
