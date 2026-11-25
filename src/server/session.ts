// The session lives in one encrypted httpOnly cookie (JWE, A256GCM). It holds the Backend's
// access and refresh tokens, so they never reach browser JavaScript.

import { EncryptJWT, jwtDecrypt } from "jose";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getConfig } from "./config";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

export interface Session {
  sid: string;
  access: string;
  /** epoch ms when the access token expires */
  accessExp: number;
  refresh: string;
  user: SessionUser;
  /** synchronizer token: the browser sends it back in X-CSRF-Token on every state change */
  csrf: string;
  createdAt: number;
  lastSeen: number;
}

/** How often the cookie is re-issued to slide the idle timeout. */
export const TOUCH_INTERVAL_MS = 60_000;

function key(): Uint8Array {
  return new Uint8Array(createHash("sha256").update(getConfig().secret).digest());
}

export function newSession(input: { access: string; accessExp: number; refresh: string; user: SessionUser }): Session {
  const now = Date.now();
  return {
    sid: randomBytes(16).toString("base64url"),
    ...input,
    csrf: randomBytes(32).toString("base64url"),
    createdAt: now,
    lastSeen: now,
  };
}

export async function seal(s: Session): Promise<string> {
  const cfg = getConfig();
  return new EncryptJWT({ s })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((s.createdAt + cfg.absoluteMs) / 1000))
    .encrypt(key());
}

/** Returns the session, or null when the cookie is missing, forged, expired or idle too long. */
export async function unseal(token: string | undefined, now = Date.now()): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key(), {
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    const s = payload.s as Session | undefined;
    if (!s || typeof s.access !== "string" || typeof s.refresh !== "string" || typeof s.csrf !== "string") return null;
    const cfg = getConfig();
    if (now - s.lastSeen > cfg.idleMs) return null;
    if (now - s.createdAt > cfg.absoluteMs) return null;
    return s;
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

export async function sessionFromRequest(req: Request): Promise<Session | null> {
  return unseal(readCookie(req.headers.get("cookie"), getConfig().cookieName));
}

export async function sessionCookie(s: Session): Promise<string> {
  const cfg = getConfig();
  const left = Math.max(1, Math.floor((s.createdAt + cfg.absoluteMs - Date.now()) / 1000));
  const attrs = [`${cfg.cookieName}=${await seal(s)}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${left}`];
  if (cfg.secureCookie) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearCookie(): string {
  const cfg = getConfig();
  const attrs = [`${cfg.cookieName}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (cfg.secureCookie) attrs.push("Secure");
  return attrs.join("; ");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
