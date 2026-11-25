import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clientIp, csrfOk, isUnsafeMethod, originOk, Throttle } from "@/server/guard";
import { getConfig } from "@/server/config";
import { clearCookie, newSession, readCookie, seal, sessionCookie, unseal } from "@/server/session";
import { adminBackendPath } from "@/server/handlers";
import { move } from "@/lib/list";
import { qs } from "@/lib/api";
import { fmtBytes, fmtDuration } from "@/lib/format";

const ENV = { ...process.env };
beforeEach(() => {
  process.env.SESSION_SECRET = "unit-test-secret-unit-test-secret-1234";
  process.env.SITE_ORIGIN = "http://localhost:3100";
  process.env.TRUST_PROXY = "false";
});
afterEach(() => {
  process.env = { ...ENV };
});

const mk = () =>
  newSession({ access: "a", accessExp: Date.now() + 60_000, refresh: "r", user: { id: "u1", email: "a@b.c", displayName: "A" } });

describe("session cookie", () => {
  it("round-trips and does not expose the tokens in the cookie", async () => {
    const s = mk();
    s.access = "SECRET-ACCESS-TOKEN";
    s.refresh = "SECRET-REFRESH-TOKEN";
    const sealed = await seal(s);
    expect(sealed).not.toContain("SECRET");
    expect(Buffer.from(sealed.split(".")[3] ?? "", "base64url").toString()).not.toContain("SECRET");
    const back = await unseal(sealed);
    expect(back?.access).toBe("SECRET-ACCESS-TOKEN");
    expect(back?.user.email).toBe("a@b.c");
  });

  it("rejects a tampered cookie, a cookie from another secret, and garbage", async () => {
    const sealed = await seal(mk());
    const flipped = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(await unseal(flipped)).toBeNull();
    expect(await unseal("not-a-token")).toBeNull();
    expect(await unseal(undefined)).toBeNull();
    process.env.SESSION_SECRET = "a-completely-different-secret-value-9999";
    expect(await unseal(sealed)).toBeNull();
  });

  it("expires after the idle timeout and after the absolute lifetime", async () => {
    process.env.SESSION_IDLE_MINUTES = "30";
    process.env.SESSION_ABSOLUTE_MINUTES = "720";
    const s = mk();
    const sealed = await seal(s);
    expect(await unseal(sealed, s.lastSeen + 29 * 60_000)).not.toBeNull();
    expect(await unseal(sealed, s.lastSeen + 31 * 60_000)).toBeNull();
    const old = { ...mk(), createdAt: Date.now() - 13 * 3600_000, lastSeen: Date.now() };
    expect(await unseal(await seal(old))).toBeNull();
  });

  it("sets httpOnly + SameSite=Strict, and Secure with the __Host- prefix on https", async () => {
    const dev = await sessionCookie(mk());
    expect(dev).toMatch(/^blac_admin=/);
    expect(dev).toContain("HttpOnly");
    expect(dev).toContain("SameSite=Strict");
    expect(dev).not.toContain("Secure");
    process.env.SITE_ORIGIN = "https://admin.example.com";
    const prod = await sessionCookie(mk());
    expect(prod).toMatch(/^__Host-blac_admin=/);
    expect(prod).toContain("Secure");
    expect(prod).toContain("Path=/");
    expect(prod).not.toContain("Domain=");
    expect(clearCookie()).toContain("Max-Age=0");
  });

  it("reads a cookie out of a header", () => {
    expect(readCookie("a=1; blac_admin=xyz; b=2", "blac_admin")).toBe("xyz");
    expect(readCookie("a=1", "blac_admin")).toBeUndefined();
    expect(readCookie(null, "x")).toBeUndefined();
  });

  it("refuses to start in production without a strong secret or https origin", () => {
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "production";
    env.SESSION_SECRET = "short";
    expect(() => getConfig()).toThrow(/SESSION_SECRET/);
    env.SESSION_SECRET = "x".repeat(40);
    env.SITE_ORIGIN = "http://admin.example.com";
    expect(() => getConfig()).toThrow(/https/);
    env.SITE_ORIGIN = "https://admin.example.com";
    expect(getConfig().loginFallback).toBe(false);
    env.ADMIN_LOGIN_FALLBACK = "true";
    expect(getConfig().loginFallback).toBe(false); // never in production
  });
});

describe("request guards", () => {
  const req = (headers: Record<string, string>) => new Request("http://localhost:3100/api/x", { method: "POST", headers });

  it("accepts only this site's origin on state changes", () => {
    expect(originOk(req({ origin: "http://localhost:3100" }))).toBe(true);
    expect(originOk(req({ origin: "http://evil.example" }))).toBe(false);
    expect(originOk(req({ origin: "http://localhost:3100.evil.example" }))).toBe(false);
    expect(originOk(req({}))).toBe(false);
  });

  it("checks the CSRF token against the session", () => {
    const s = mk();
    expect(csrfOk(req({ "x-csrf-token": s.csrf }), s)).toBe(true);
    expect(csrfOk(req({ "x-csrf-token": "nope" }), s)).toBe(false);
    expect(csrfOk(req({}), s)).toBe(false);
  });

  it("knows which methods change state", () => {
    expect(isUnsafeMethod("GET")).toBe(false);
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) expect(isUnsafeMethod(m)).toBe(true);
  });

  it("only trusts X-Forwarded-For behind a trusted proxy, and only the entry the proxy added", () => {
    const h = { "x-forwarded-for": "6.6.6.6, 203.0.113.9" };
    expect(clientIp(req(h))).toBeUndefined();
    process.env.TRUST_PROXY = "true";
    expect(clientIp(req(h))).toBe("203.0.113.9");
    expect(clientIp(req({ "x-forwarded-for": "not-an-ip" }))).toBeUndefined();
    expect(clientIp(req({}))).toBeUndefined();
  });

  it("throttles after the limit and recovers after the window", () => {
    const t = new Throttle(3, 1000);
    expect([1, 2, 3].map(() => t.hit("k", 0))).toEqual([0, 0, 0]);
    expect(t.hit("k", 10)).toBeGreaterThan(0);
    expect(t.hit("other", 10)).toBe(0);
    expect(t.hit("k", 2000)).toBe(0);
    t.hit("z", 0);
    t.reset("z");
  });
});

describe("proxy path allowlist", () => {
  it("maps clean segments under /v1/admin", () => {
    expect(adminBackendPath(["users", "usr_1", "ban"])).toBe("/v1/admin/users/usr_1/ban");
    expect(adminBackendPath(["stats", "overview"])).toBe("/v1/admin/stats/overview");
  });
  it("rejects traversal, encoded separators, empty and overlong paths", () => {
    expect(adminBackendPath([])).toBeNull();
    expect(adminBackendPath([".."])).toBeNull();
    expect(adminBackendPath(["users", ".."])).toBeNull();
    expect(adminBackendPath(["..", "auth", "refresh"])).toBeNull();
    expect(adminBackendPath(["a/b"])).toBeNull();
    expect(adminBackendPath(["a%2fb"])).toBeNull();
    expect(adminBackendPath(["users?x=1"])).toBeNull();
    expect(adminBackendPath(Array(9).fill("a"))).toBeNull();
  });
});

describe("helpers", () => {
  it("moves list items safely", () => {
    expect(move([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(move([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
    const same = [1, 2];
    expect(move(same, 0, 5)).toBe(same);
    expect(move(same, -1, 0)).toBe(same);
  });
  it("builds query strings without empty values", () => {
    expect(qs({ q: "a b", status: "", limit: 25, off: undefined, flag: false })).toBe("?q=a+b&limit=25");
    expect(qs({})).toBe("");
  });
  it("formats bytes and durations", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtBytes(10 * 1024 ** 3)).toBe("10.0 GB");
    expect(fmtDuration(125_000)).toBe("2:05");
  });
});
