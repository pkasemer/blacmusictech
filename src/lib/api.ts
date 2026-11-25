// Browser side: talks only to this site's own /api routes (same origin), never to the Backend.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

let csrfToken = "";
export function setCsrf(token: string): void {
  csrfToken = token;
}

// The app shell installs the real handler (a router redirect to /login).
let onSignedOut: () => void = () => {};
export function setSignedOutHandler(f: () => void): void {
  onSignedOut = f;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  let res: Response;
  try {
    res = await fetch(path.startsWith("/api/") ? path : `/api/admin${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      cache: "no-store",
      signal: init.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network", "Could not reach the server. Check your connection.");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | undefined)?.error;
    const code = err?.code ?? "error";
    if (res.status === 401 && code !== "invalid_credentials") onSignedOut();
    if (res.status === 403 && (code === "forbidden" || code === "account_banned")) onSignedOut();
    const retry = Number(res.headers.get("retry-after") ?? "");
    throw new ApiError(res.status, code, err?.message ?? `Request failed (${res.status})`, Number.isFinite(retry) ? retry : undefined);
  }
  return data as T;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
