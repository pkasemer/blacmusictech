/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// Integration: the real BFF handlers against the mock Backend over HTTP.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, MOCK_USER_EMAIL, MOCK_USER_PASSWORD, type Mock } from "../mock/mock";
import { handleAdminProxy, handleLogin, handleLogout, handleSearch, handleSession, loginByEmail, loginByIp } from "@/server/handlers";

const ORIGIN = "http://localhost:3100";
let mock: Mock;
let port: number;

interface Jar {
  cookie: string;
}
const jar = (): Jar => ({ cookie: "" });

function absorb(j: Jar, res: Response): void {
  for (const c of res.headers.getSetCookie()) {
    const [pair = ""] = c.split(";");
    const [name = "", value = ""] = pair.split("=");
    if (/Max-Age=0/i.test(c) || value === "") j.cookie = "";
    else j.cookie = `${name}=${value}`;
  }
}

async function call(
  fn: (req: Request) => Promise<Response>,
  url: string,
  o: { method?: string; body?: unknown; jar?: Jar; csrf?: string; origin?: string | null; headers?: Record<string, string> } = {},
): Promise<{ res: Response; json: any }> {
  const headers: Record<string, string> = { ...o.headers };
  if (o.body !== undefined) headers["content-type"] = "application/json";
  if (o.jar?.cookie) headers.cookie = o.jar.cookie;
  if (o.csrf) headers["x-csrf-token"] = o.csrf;
  if (o.origin !== null && (o.method ?? "GET") !== "GET") headers.origin = o.origin ?? ORIGIN;
  const res = await fn(new Request(`${ORIGIN}${url}`, { method: o.method ?? "GET", headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) }));
  if (o.jar) absorb(o.jar, res);
  const text = await res.text();
  return { res, json: text ? JSON.parse(text) : undefined };
}

const admin = (path: string[]) => (req: Request) => handleAdminProxy(req, path);

async function signIn(j = jar()): Promise<{ jar: Jar; csrf: string }> {
  const r = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }, jar: j });
  expect(r.res.status).toBe(200);
  return { jar: j, csrf: r.json.csrf };
}

beforeAll(async () => {
  mock = createMock({ accessTtl: 900 });
  port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "integration-secret-integration-secret-12";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => {
  loginByIp.reset("ip:?");
  loginByEmail.reset(`email:${MOCK_ADMIN_EMAIL}`);
  loginByEmail.reset(`email:${MOCK_USER_EMAIL}`);
  mock.log.length = 0;
  delete process.env.ADMIN_LOGIN_FALLBACK;
});

describe("sign in", () => {
  it("signs an admin in and never returns the Backend tokens to the browser", async () => {
    const j = jar();
    const { res, json } = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }, jar: j });
    expect(res.status).toBe(200);
    expect(json.user.email).toBe(MOCK_ADMIN_EMAIL);
    expect(json.csrf).toBeTruthy();
    expect(JSON.stringify(json)).not.toMatch(/accessToken|refreshToken/);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const s = await call(handleSession, "/api/auth/session", { jar: j });
    expect(s.res.status).toBe(200);
    expect(s.json.csrf).toBe(json.csrf);
  });

  it("gives wrong passwords and unknown emails the same generic answer", async () => {
    const a = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email: MOCK_ADMIN_EMAIL, password: "wrong-password" } });
    const b = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email: "nobody@example.com", password: "whatever" } });
    expect(a.res.status).toBe(401);
    expect(b.res.status).toBe(401);
    expect(a.json).toEqual(b.json);
    expect(a.res.headers.get("set-cookie")).toBeNull();
  });

  it("refuses a login that does not come from this site", async () => {
    const body = { email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD };
    expect((await call(handleLogin, "/api/auth/login", { method: "POST", body, origin: "http://evil.example" })).res.status).toBe(403);
    expect((await call(handleLogin, "/api/auth/login", { method: "POST", body, origin: null })).res.status).toBe(403);
  });

  it("rejects malformed input without calling the Backend", async () => {
    const r = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email: "x" } });
    expect(r.res.status).toBe(400);
    expect(mock.log.length).toBe(0);
  });

  it("locks out after repeated failures (Backend lockout is passed through with Retry-After)", async () => {
    const email = "lockout@example.com";
    let last: Awaited<ReturnType<typeof call>> | undefined;
    for (let i = 0; i < 6; i++) last = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email, password: "bad-password" } });
    expect(last!.res.status).toBe(429);
    expect(last!.res.headers.get("retry-after")).toBeTruthy();
    loginByEmail.reset(`email:${email}`);
  });

  it("has its own throttle in front of the Backend", async () => {
    const email = "throttle@example.com";
    for (let i = 0; i < 10; i++) await call(handleLogin, "/api/auth/login", { method: "POST", body: { email, password: "bad-password" } });
    mock.log.length = 0;
    const r = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email, password: "bad-password" } });
    expect(r.res.status).toBe(429);
    expect(mock.log.length).toBe(0);
    loginByEmail.reset(`email:${email}`);
  });

  it("with the dev fallback, also detects today's Backend (401 unauthorized for the unknown admin login path)", async () => {
    const old = createMock({ adminLoginMissing: "unauthorized" });
    const p = await old.listen(0);
    const prev = process.env.BACKEND_URL;
    process.env.BACKEND_URL = `http://127.0.0.1:${p}`;
    try {
      process.env.ADMIN_LOGIN_FALLBACK = "true";
      const ok = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD } });
      expect(ok.res.status).toBe(200);
      const bad = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email: MOCK_ADMIN_EMAIL, password: "wrong-password" } });
      expect(bad.res.status).toBe(401);
    } finally {
      process.env.BACKEND_URL = prev;
      await old.close();
    }
  });

  it("with the dev fallback, a non-admin account is refused and its fresh tokens revoked; admins still get in", async () => {
    const old = createMock({ adminLoginMissing: true });
    const p = await old.listen(0);
    const prev = process.env.BACKEND_URL;
    process.env.BACKEND_URL = `http://127.0.0.1:${p}`;
    try {
      // without the fallback flag a missing admin login is just a failure
      const off = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD } });
      expect(off.res.status).toBe(502);
      process.env.ADMIN_LOGIN_FALLBACK = "true";
      const user = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email: MOCK_USER_EMAIL, password: MOCK_USER_PASSWORD } });
      expect(user.res.status).toBe(401);
      expect(user.json.error.code).toBe("invalid_credentials");
      expect(user.res.headers.get("set-cookie")).toBeNull();
      expect(old.log.some((l) => l.path === "/v1/auth/logout")).toBe(true); // the tokens it was just given are revoked
      const ok = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD } });
      expect(ok.res.status).toBe(200);
    } finally {
      process.env.BACKEND_URL = prev;
      await old.close();
    }
  });
});

describe("admin proxy", () => {
  it("answers 401 without a session", async () => {
    const r = await call(admin(["users"]), "/api/admin/users");
    expect(r.res.status).toBe(401);
    expect(mock.log.length).toBe(0);
  });

  it("forwards reads with the bearer token held in the cookie", async () => {
    const { jar: j } = await signIn();
    mock.log.length = 0;
    const r = await call(admin(["users"]), "/api/admin/users?limit=3", { jar: j });
    expect(r.res.status).toBe(200);
    expect(r.json.users).toHaveLength(3);
    expect(mock.log[0]?.path).toBe("/v1/admin/users?limit=3");
    expect(mock.log[0]?.auth).toMatch(/^Bearer .{20,}/);
  });

  it("blocks state changes without the CSRF token or from another origin, before reaching the Backend", async () => {
    const { jar: j, csrf } = await signIn();
    mock.log.length = 0;
    const body = { reason: "spam accounts" };
    const noCsrf = await call(admin(["users", "usr_0001", "ban"]), "/x", { method: "POST", body, jar: j });
    const wrongCsrf = await call(admin(["users", "usr_0001", "ban"]), "/x", { method: "POST", body, jar: j, csrf: "wrong" });
    const evil = await call(admin(["users", "usr_0001", "ban"]), "/x", { method: "POST", body, jar: j, csrf, origin: "http://evil.example" });
    expect([noCsrf.res.status, wrongCsrf.res.status, evil.res.status]).toEqual([403, 403, 403]);
    expect(mock.log.length).toBe(0);
  });

  it("bans with a reason, writes the audit entry, and enforces the reason rule", async () => {
    const { jar: j, csrf } = await signIn();
    const short = await call(admin(["users", "usr_0001", "ban"]), "/x", { method: "POST", body: { reason: "x" }, jar: j, csrf });
    expect(short.res.status).toBe(422);
    const ok = await call(admin(["users", "usr_0001", "ban"]), "/x", { method: "POST", body: { reason: "Spam uploads" }, jar: j, csrf });
    expect(ok.res.status).toBe(204);
    const detail = await call(admin(["users", "usr_0001"]), "/x", { jar: j });
    expect(detail.json.banned).toBe(true);
    expect(detail.json.ban.reason).toBe("Spam uploads");
    const log = await call(admin(["audit-log"]), "/api/admin/audit-log?action=user.ban&targetId=usr_0001", { jar: j });
    expect(log.json.entries[0]).toMatchObject({ action: "user.ban", targetId: "usr_0001", reason: "Spam uploads", actor: { email: MOCK_ADMIN_EMAIL } });
    const un = await call(admin(["users", "usr_0001", "unban"]), "/x", { method: "POST", body: {}, jar: j, csrf });
    expect(un.res.status).toBe(204);
  });

  it("will not delete an administrator, and deleting needs the exact email and a reason", async () => {
    const { jar: j, csrf } = await signIn();
    const self = await call(admin(["users", "usr_admin"]), "/x", { method: "DELETE", body: { reason: "cleanup", confirmEmail: MOCK_ADMIN_EMAIL }, jar: j, csrf });
    expect(self.res.status).toBe(409);
    expect(self.json.error.code).toBe("is_admin");
    const mismatch = await call(admin(["users", "usr_0002"]), "/x", { method: "DELETE", body: { reason: "cleanup", confirmEmail: "wrong@example.com" }, jar: j, csrf });
    expect(mismatch.res.status).toBe(422);
    const prev = await call(admin(["users", "usr_0002", "deletion-preview"]), "/x", { jar: j });
    expect(prev.json).toHaveProperty("releases");
    const email = (await call(admin(["users", "usr_0002"]), "/x", { jar: j })).json.email as string;
    const del = await call(admin(["users", "usr_0002"]), "/x", { method: "DELETE", body: { reason: "Requested by the user", confirmEmail: email }, jar: j, csrf });
    expect(del.res.status).toBe(204);
    expect((await call(admin(["users", "usr_0002"]), "/x", { jar: j })).res.status).toBe(404);
    const log = await call(admin(["audit-log"]), "/api/admin/audit-log?action=user.delete", { jar: j });
    expect(log.json.entries[0].targetId).toBe("usr_0002");
  });

  it("handles verification decisions: approve, reject needs a note, revoke", async () => {
    const { jar: j, csrf } = await signIn();
    const queue = await call(admin(["artists"]), "/api/admin/artists?status=pending&limit=100", { jar: j });
    const pending = queue.json.artists.filter((a: { banned: boolean }) => !a.banned);
    expect(pending.length).toBeGreaterThan(1);
    const [first, second] = pending;
    const noNote = await call(admin(["artists", second.id, "verification"]), "/x", { method: "POST", body: { decision: "reject", note: "" }, jar: j, csrf });
    expect(noNote.res.status).toBe(422);
    expect((await call(admin(["artists", first.id, "verification"]), "/x", { method: "POST", body: { decision: "approve" }, jar: j, csrf })).res.status).toBe(204);
    expect((await call(admin(["artists", second.id, "verification"]), "/x", { method: "POST", body: { decision: "reject", note: "Cannot confirm identity" }, jar: j, csrf })).res.status).toBe(204);
    expect((await call(admin(["artists", first.id, "verification"]), "/x", { method: "POST", body: { decision: "revoke", note: "Impersonation report" }, jar: j, csrf })).res.status).toBe(204);
    const detail = await call(admin(["artists", first.id]), "/x", { jar: j });
    expect(detail.json.verification.state).toBe("unverified");
  });

  it("takes a release down and restores it; republishing is the Backend's call", async () => {
    const { jar: j, csrf } = await signIn();
    const id = "alb_000_0";
    expect((await call(admin(["releases", id, "takedown"]), "/x", { method: "POST", body: { reason: "Uncleared sample" }, jar: j, csrf })).res.status).toBe(204);
    const d = await call(admin(["releases", id]), "/x", { jar: j });
    expect(d.json.takenDown).toBe(true);
    expect(d.json.visibility).toBe("draft");
    expect((await call(admin(["releases", id, "restore"]), "/x", { method: "POST", body: {}, jar: j, csrf })).res.status).toBe(204);
    expect((await call(admin(["releases", id]), "/x", { jar: j })).json.takenDown).toBe(false);
  });

  it("edits editorial playlists: replace tracks, publish needs a public track, unpublish", async () => {
    const { jar: j, csrf } = await signIn();
    const created = await call(admin(["playlists"]), "/x", { method: "POST", body: { name: "Test mix", description: "" }, jar: j, csrf });
    expect(created.res.status).toBe(201);
    const id = created.json.id as string;
    const empty = await call(admin(["playlists", id, "publish"]), "/x", { method: "POST", jar: j, csrf });
    expect(empty.res.status).toBe(422);
    const found = await call(handleSearch, "/api/search?q=e&limit=5", { jar: j });
    const ids = (found.json.tracks as { id: string }[]).slice(0, 3).map((t) => t.id);
    expect(ids.length).toBe(3);
    const reordered = [ids[2]!, ids[0]!, ids[1]!];
    const put = await call(admin(["playlists", id, "items"]), "/x", { method: "PUT", body: { trackIds: reordered }, jar: j, csrf });
    expect(put.res.status).toBe(200);
    expect(put.json.items.map((i: { trackId: string }) => i.trackId)).toEqual(reordered);
    expect((await call(admin(["playlists", id, "items"]), "/x", { method: "PUT", body: { trackIds: ["trk_nope"] }, jar: j, csrf })).res.status).toBe(422);
    const pub = await call(admin(["playlists", id, "publish"]), "/x", { method: "POST", jar: j, csrf });
    expect(pub.json.isPublic).toBe(true);
    const unpub = await call(admin(["playlists", id, "unpublish"]), "/x", { method: "POST", jar: j, csrf });
    expect(unpub.json.isPublic).toBe(false);
  });

  it("serves stats and the track search", async () => {
    const { jar: j } = await signIn();
    const o = await call(admin(["stats", "overview"]), "/x", { jar: j });
    expect(o.json.users.total).toBeGreaterThan(10);
    const ts = await call(admin(["stats", "timeseries"]), "/api/admin/stats/timeseries?metric=signups&from=2026-11-01&to=2026-11-10&bucket=day", { jar: j });
    expect(ts.json.points).toHaveLength(10);
    const top = await call(admin(["stats", "top"]), "/api/admin/stats/top?kind=artists&limit=3", { jar: j });
    expect(top.json.items).toHaveLength(3);
    const noQ = await call(handleSearch, "/api/search", { jar: j });
    expect(noQ.res.status).toBe(400);
  });

  it("only forwards the visitor address from a trusted proxy, and never a spoofed one", async () => {
    process.env.TRUST_PROXY = "true";
    try {
      const r = await call(handleLogin, "/api/auth/login", {
        method: "POST",
        body: { email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD },
        headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.50", "x-real-ip": "9.9.9.9" },
      });
      expect(r.res.status).toBe(200);
      const entry = mock.log.find((l) => l.path === "/v1/admin/auth/login");
      expect(entry?.xff).toBe("203.0.113.50");
    } finally {
      process.env.TRUST_PROXY = "false";
    }
  });
});

describe("sessions and tokens", () => {
  it("rotates the Backend tokens when the access token is about to expire", async () => {
    const short = createMock({ accessTtl: 5 }); // under the 30 s refresh margin
    const p = await short.listen(0);
    const prev = process.env.BACKEND_URL;
    process.env.BACKEND_URL = `http://127.0.0.1:${p}`;
    try {
      const { jar: j } = await signIn();
      const before = j.cookie;
      short.log.length = 0;
      const r = await call(admin(["stats", "overview"]), "/x", { jar: j });
      expect(r.res.status).toBe(200);
      expect(short.log.map((l) => l.path)).toEqual(["/v1/auth/refresh", "/v1/admin/stats/overview"]);
      expect(j.cookie).not.toBe(before); // a new cookie carries the rotated pair
      // two parallel requests with the same (now old) cookie share one rotation instead of killing the session
      const stale = { cookie: j.cookie };
      short.log.length = 0;
      const [a, b] = await Promise.all([call(admin(["stats", "overview"]), "/x", { jar: { cookie: stale.cookie } }), call(admin(["users"]), "/x", { jar: { cookie: stale.cookie } })]);
      expect([a.res.status, b.res.status]).toEqual([200, 200]);
      expect(short.log.filter((l) => l.path === "/v1/auth/refresh")).toHaveLength(1);
    } finally {
      process.env.BACKEND_URL = prev;
      await short.close();
    }
  });

  it("ends the session when the Backend no longer honours the refresh token", async () => {
    const short = createMock({ accessTtl: 5 });
    const p = await short.listen(0);
    const prev = process.env.BACKEND_URL;
    process.env.BACKEND_URL = `http://127.0.0.1:${p}`;
    try {
      const { jar: j } = await signIn();
      // the user is banned meanwhile: refresh is refused
      short.state.users.find((u) => u.id === "usr_admin")!.ban = { at: new Date().toISOString(), reason: "x", by: "x" };
      const r = await call(admin(["stats", "overview"]), "/x", { jar: j });
      expect(r.res.status).toBe(401);
      expect(r.json.error.code).toBe("session_expired");
      expect(j.cookie).toBe(""); // cookie cleared
    } finally {
      process.env.BACKEND_URL = prev;
      await short.close();
    }
  });

  it("clears the cookie when the Backend says the account lost admin rights", async () => {
    const { jar: j } = await signIn();
    mock.state.users.find((u) => u.id === "usr_admin")!.role = "user";
    try {
      const r = await call(admin(["stats", "overview"]), "/x", { jar: j });
      expect(r.res.status).toBe(403);
      expect(r.json.error.code).toBe("forbidden");
      expect(j.cookie).toBe("");
    } finally {
      mock.state.users.find((u) => u.id === "usr_admin")!.role = "admin";
    }
  });

  it("signs out: the Backend refresh token is revoked and the cookie cleared", async () => {
    const { jar: j, csrf } = await signIn();
    const noCsrf = await call(handleLogout, "/api/auth/logout", { method: "POST", jar: j });
    expect(noCsrf.res.status).toBe(403);
    mock.log.length = 0;
    const out = await call(handleLogout, "/api/auth/logout", { method: "POST", jar: j, csrf });
    expect(out.res.status).toBe(204);
    expect(j.cookie).toBe("");
    expect(mock.log.some((l) => l.path === "/v1/auth/logout")).toBe(true);
    expect((await call(handleSession, "/api/auth/session", { jar: j })).res.status).toBe(401);
  });

  it("rejects a forged session cookie", async () => {
    const r = await call(admin(["users"]), "/x", { jar: { cookie: "blac_admin=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..AAAA.BBBB.CCCC" } });
    expect(r.res.status).toBe(401);
  });
});
