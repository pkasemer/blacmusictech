// Request guards: CSRF (Origin check + synchronizer token), client address, simple throttling.

import { isIP } from "node:net";
import { getConfig } from "./config";
import { safeEqual, type Session } from "./session";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isUnsafeMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/** State-changing requests must come from this site's own origin. */
export function originOk(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false; // browsers always send Origin on POST/PUT/PATCH/DELETE
  return origin === getConfig().siteOrigin;
}

export function csrfOk(req: Request, s: Session): boolean {
  const sent = req.headers.get("x-csrf-token");
  return !!sent && safeEqual(sent, s.csrf);
}

/**
 * The visitor's address, for the Backend's per-IP sign-in lockout. Only taken from X-Forwarded-For when
 * TRUST_PROXY=true, and then only the rightmost entry (the one our own proxy appended), never anything
 * the visitor could have supplied.
 */
export function clientIp(req: Request): string | undefined {
  if (!getConfig().trustProxy) return undefined;
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return undefined;
  const last = xff.split(",").pop()?.trim() ?? "";
  return isIP(last) ? last : undefined;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** In-memory fixed-window limiter. A second layer in front of the Backend's own lockout. */
export class Throttle {
  private buckets = new Map<string, Bucket>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  /** Records a hit; returns the seconds to wait when the limit is exceeded, else 0. */
  hit(key: string, now = Date.now()): number {
    if (this.buckets.size > 5000) this.sweep(now);
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, b);
    }
    b.count++;
    return b.count > this.limit ? Math.ceil((b.resetAt - now) / 1000) : 0;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private sweep(now: number): void {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}
