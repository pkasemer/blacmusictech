// Browser side: talks only to this site's own /api routes (same origin), never to the Backend.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

let csrfToken = "";
export function setCsrf(token: string): void {
  csrfToken = token;
}
export function getCsrf(): string {
  return csrfToken;
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
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
    const code = err?.code ?? "error";
    if (res.status === 401 && code !== "invalid_credentials") onSignedOut();
    if (res.status === 403 && (code === "forbidden" || code === "account_banned")) onSignedOut();
    const retry = Number(res.headers.get("retry-after") ?? "");
    throw new ApiError(res.status, code, err?.message ?? `Request failed (${res.status})`, Number.isFinite(retry) ? retry : undefined, err?.details);
  }
  return data as T;
}

/** Uploads a file as the raw request body (used for cover images). */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": file.type, "X-CSRF-Token": csrfToken, Accept: "application/json" },
      body: file,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "Could not reach the server. Check your connection.");
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | undefined)?.error;
    if (res.status === 401) onSignedOut();
    throw new ApiError(res.status, err?.code ?? "error", err?.message ?? `Upload failed (${res.status})`);
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
