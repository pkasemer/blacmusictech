// Runtime configuration for the server side of the admin site. Read on every call
// (not cached at import) so tests can change the environment.

export interface ServerConfig {
  production: boolean;
  backendUrl: string;
  secret: string;
  siteOrigin: string;
  trustProxy: boolean;
  idleMs: number;
  absoluteMs: number;
  loginFallback: boolean;
  cookieName: string;
  secureCookie: boolean;
  imageOrigins: string[];
  /** where the audio player may load tracks from (the object storage host) */
  mediaOrigins: string[];
}

const DEV_SECRET = "dev-only-session-secret-do-not-use-in-production";

function int(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getConfig(): ServerConfig {
  const production = process.env.NODE_ENV === "production";
  const secret = process.env.SESSION_SECRET ?? "";
  if (production && secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to 32+ characters in production");
  }
  const siteOrigin = (process.env.SITE_ORIGIN ?? "http://localhost:3100").replace(/\/+$/, "");
  if (production && !siteOrigin.startsWith("https://")) {
    throw new Error("SITE_ORIGIN must be an https:// origin in production");
  }
  const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:8080").replace(/\/+$/, "");
  const secure = siteOrigin.startsWith("https://");
  const extra = (process.env.IMAGE_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const media = (process.env.MEDIA_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    production,
    backendUrl,
    secret: secret || DEV_SECRET,
    siteOrigin,
    trustProxy: process.env.TRUST_PROXY === "true",
    idleMs: int("SESSION_IDLE_MINUTES", 30) * 60_000,
    absoluteMs: int("SESSION_ABSOLUTE_MINUTES", 720) * 60_000,
    // The stopgap is never available in production.
    loginFallback: !production && process.env.ADMIN_LOGIN_FALLBACK === "true",
    cookieName: secure ? "__Host-blac_admin" : "blac_admin",
    secureCookie: secure,
    imageOrigins: [new URL(backendUrl).origin, ...extra],
    mediaOrigins: [new URL(backendUrl).origin, ...media, ...(production ? [] : ["http://localhost:9000", "http://127.0.0.1:9000"])],
  };
}
