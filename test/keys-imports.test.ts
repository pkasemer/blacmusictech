/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// Import keys and import runs: the shared logic, and the real handlers against the mock Backend.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { isLive, keyState, progressOf } from "@/lib/imports";
import { handleAdminProxy, handleLogin, loginByEmail, loginByIp } from "@/server/handlers";

describe("key state and import progress", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  it("tells active, expired and revoked keys apart (revoked wins)", () => {
    expect(keyState({ revokedAt: null, expiresAt: "2026-11-27T00:00:00Z" }, now)).toBe("active");
    expect(keyState({ revokedAt: null, expiresAt: "2026-11-26T11:59:59Z" }, now)).toBe("expired");
    expect(keyState({ revokedAt: "2026-11-20T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z" }, now)).toBe("revoked");
  });
  it("counts finished tracks, whatever their result, and never leaves 0..1", () => {
    expect(progressOf({ totalTracks: 10, created: 4, skippedDuplicate: 1, failed: 1 })).toBeCloseTo(0.6);
    expect(progressOf({ totalTracks: 0, created: 0, skippedDuplicate: 0, failed: 0 })).toBe(0);
    expect(progressOf({ totalTracks: 2, created: 3, skippedDuplicate: 0, failed: 0 })).toBe(1);
  });
  it("keeps refreshing only while a run can still change", () => {
    expect(["pending", "processing"].every((s) => isLive(s as never))).toBe(true);
    expect(["completed", "completed_with_errors", "failed", "cancelled"].some((s) => isLive(s as never))).toBe(false);
  });
});

const ORIGIN = "http://localhost:3100";
let mock: Mock;
interface Jar {
  cookie: string;
}
async function call(
  fn: (req: Request) => Promise<Response>,
  url: string,
  o: { method?: string; body?: unknown; jar?: Jar; csrf?: string } = {},
): Promise<{ res: Response; json: any; text: string }> {
  const headers: Record<string, string> = {};
  if (o.body !== undefined) headers["content-type"] = "application/json";
  if (o.jar?.cookie) headers.cookie = o.jar.cookie;
  if (o.csrf) headers["x-csrf-token"] = o.csrf;
  if ((o.method ?? "GET") !== "GET") headers.origin = ORIGIN;
  const res = await fn(new Request(`${ORIGIN}${url}`, { method: o.method ?? "GET", headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) }));
  if (o.jar) {
    for (const c of res.headers.getSetCookie()) {
      const [pair = ""] = c.split(";");
      o.jar.cookie = /Max-Age=0/i.test(c) ? "" : pair;
    }
  }
  const text = await res.text();
  return { res, json: text ? JSON.parse(text) : undefined, text };
}
const admin = (path: string[]) => (req: Request) => handleAdminProxy(req, path);
async function signIn() {
  const jar: Jar = { cookie: "" };
  const r = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }, jar });
  return { jar, csrf: r.json.csrf as string };
}

beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "keys-secret-keys-secret-keys-secret-12";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => {
  loginByIp.reset("ip:?");
  loginByEmail.reset(`email:${MOCK_ADMIN_EMAIL}`);
});

describe("import keys through the site", () => {
  it("shows a new key once, never in the list, and answers without caching", async () => {
    const s = await signIn();
    const made = await call(admin(["api-keys"]), "/api/admin/api-keys", { method: "POST", body: { name: "Loader", expiresInDays: 7 }, ...s });
    expect(made.res.status).toBe(201);
    expect(made.json.key).toMatch(/^blac_imp_.{20,}/);
    expect(made.json.scope).toBe("import");
    expect(made.res.headers.get("cache-control")).toBe("no-store");
    const list = await call(admin(["api-keys"]), "/api/admin/api-keys", { jar: s.jar });
    expect(list.text).not.toContain(made.json.key);
    const row = list.json.keys.find((k: any) => k.id === made.json.id);
    expect(row).toMatchObject({ name: "Loader", revokedAt: null, lastUsedAt: null, createdBy: MOCK_ADMIN_EMAIL });
    expect(row.key).toBeUndefined();
    expect(made.json.key.startsWith(row.prefix)).toBe(true);
    const log = await call(admin(["audit-log"]), "/api/admin/audit-log?action=apikey", { jar: s.jar });
    expect(log.text).not.toContain(made.json.key);
    expect(log.json.entries[0]).toMatchObject({ action: "apikey.create", targetLabel: "Loader" });
  });

  it("validates, needs the CSRF token, and revokes once", async () => {
    const s = await signIn();
    for (const body of [{ name: "" }, { name: "x".repeat(61) }, { name: "ok", expiresInDays: 0 }, { name: "ok", expiresInDays: 366 }]) {
      expect((await call(admin(["api-keys"]), "/x", { method: "POST", body, ...s })).res.status).toBe(422);
    }
    expect((await call(admin(["api-keys"]), "/x", { method: "POST", body: { name: "No token" }, jar: s.jar })).res.status).toBe(403);
    expect((await call(admin(["api-keys"]), "/x", { method: "POST", body: { name: "x" } })).res.status).toBe(401);
    const made = await call(admin(["api-keys"]), "/x", { method: "POST", body: { name: "Short lived" }, ...s });
    expect((await call(admin(["api-keys", made.json.id]), "/x", { method: "DELETE", jar: s.jar })).res.status).toBe(403); // no CSRF token
    expect((await call(admin(["api-keys", made.json.id]), "/x", { method: "DELETE", ...s })).res.status).toBe(204);
    expect((await call(admin(["api-keys", made.json.id]), "/x", { method: "DELETE", ...s })).res.status).toBe(404);
    const list = await call(admin(["api-keys"]), "/x", { jar: s.jar });
    expect(list.json.keys.find((k: any) => k.id === made.json.id).revokedAt).toBeTruthy();
  });
});

describe("import runs through the site", () => {
  it("lists runs without per-track results, shows one in full, and never includes upload links", async () => {
    const s = await signIn();
    const list = await call(admin(["imports"]), "/x", { jar: s.jar });
    expect(list.res.status).toBe(200);
    expect(list.json.imports.length).toBeGreaterThanOrEqual(4);
    expect(list.json.imports[0].results).toBeUndefined();
    const one = await call(admin(["imports", "imp_errors"]), "/x", { jar: s.jar });
    expect(one.json.status).toBe("completed_with_errors");
    expect(one.json.results.map((r: any) => r.status)).toEqual(["created", "failed", "skippedDuplicate"]);
    expect(one.json.errors[0]).toMatchObject({ title: "Other Song", code: "corrupt_audio" });
    expect(one.text + list.text).not.toMatch(/X-Amz|mock-storage|"upload"/);
  });

  it("cancels only a run that has not started, and records it", async () => {
    const s = await signIn();
    const busy = await call(admin(["imports", "imp_running"]), "/x", { method: "DELETE", ...s });
    expect(busy.res.status).toBe(409);
    expect(busy.json.error.code).toBe("not_pending");
    expect((await call(admin(["imports", "imp_waiting"]), "/x", { method: "DELETE", jar: s.jar })).res.status).toBe(403);
    expect((await call(admin(["imports", "imp_waiting"]), "/x", { method: "DELETE", ...s })).res.status).toBe(204);
    const after = await call(admin(["imports", "imp_waiting"]), "/x", { jar: s.jar });
    expect(after.json.status).toBe("cancelled");
    expect((await call(admin(["imports", "imp_nope"]), "/x", { jar: s.jar })).res.status).toBe(404);
    const log = await call(admin(["audit-log"]), "/api/admin/audit-log?targetType=import", { jar: s.jar });
    expect(log.json.entries.map((e: any) => e.action)).toContain("import.cancel");
  });
});
