/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// Marking an artist verified (with or without a request) and revoking it: the rules, and the real handlers against the mock.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { grantDecision, verificationError } from "@/lib/verification";
import { handleAdminProxy, handleLogin } from "@/server/handlers";

describe("verification rules", () => {
  it("approves a waiting request, verifies anyone else directly, and offers nothing to a verified artist", () => {
    expect(grantDecision("pending")).toBe("approve");
    expect(grantDecision("unverified")).toBe("verify");
    expect(grantDecision("rejected")).toBe("verify");
    expect(grantDecision("verified")).toBeNull();
  });
  it("explains refusals, including a server that cannot verify without a request yet", () => {
    expect(verificationError("verify", "bad_request", "x")).toMatch(/latest Backend update/);
    expect(verificationError("revoke", "bad_request", "kept")).toBe("kept");
    expect(verificationError("verify", "artist_banned", "x")).toMatch(/Unban/);
    expect(verificationError("verify", "already_verified", "x")).toMatch(/already verified/);
    expect(verificationError("revoke", "not_verified", "x")).toMatch(/not verified any more/);
    expect(verificationError("approve", "something_else", "kept")).toBe("kept");
  });
});

const ORIGIN = "http://localhost:3100";
let mock: Mock;
interface Jar {
  cookie: string;
}
async function call(fn: (req: Request) => Promise<Response>, o: { method?: string; body?: unknown; jar?: Jar; csrf?: string; url?: string } = {}) {
  const headers: Record<string, string> = {};
  if (o.body !== undefined) headers["content-type"] = "application/json";
  if (o.jar?.cookie) headers.cookie = o.jar.cookie;
  if (o.csrf) headers["x-csrf-token"] = o.csrf;
  if ((o.method ?? "GET") !== "GET") headers.origin = ORIGIN;
  const res = await fn(new Request(`${ORIGIN}${o.url ?? "/x"}`, { method: o.method ?? "GET", headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) }));
  if (o.jar) {
    for (const c of res.headers.getSetCookie()) o.jar.cookie = /Max-Age=0/i.test(c) ? "" : c.split(";")[0]!;
  }
  const text = await res.text();
  return { res, json: (text ? JSON.parse(text) : undefined) as any };
}
const admin = (path: string[]) => (req: Request) => handleAdminProxy(req, path);

beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "verify-secret-verify-secret-verify-12";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});

describe("verify and revoke through the site", () => {
  it("verifies an artist who never asked, revokes it, and verifies again, each step audited with its note", async () => {
    const jar: Jar = { cookie: "" };
    const login = await call(handleLogin, { method: "POST", body: { email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }, jar });
    const s = { jar, csrf: login.json.csrf as string };
    const made = await call(admin(["artists"]), { method: "POST", body: { name: "Never Asked" }, ...s });
    const id = made.json.id as string;
    expect(made.json.verification.state).toBe("unverified");
    const decide = (body: unknown) => call(admin(["artists", id, "verification"]), { method: "POST", body, ...s });
    const state = async () => (await call(admin(["artists", id]), { jar })).json.verification.state;

    expect((await decide({ decision: "approve" })).res.status).toBe(409); // there is no request to approve
    expect((await decide({ decision: "verify", note: "Checked ID by phone" })).res.status).toBe(204);
    expect(await state()).toBe("verified");
    const again = await decide({ decision: "verify" });
    expect(again.res.status).toBe(409);
    expect(again.json.error.code).toBe("already_verified");

    expect((await decide({ decision: "revoke", note: "" })).res.status).toBe(422); // a revoke needs a reason
    expect((await decide({ decision: "revoke", note: "Impersonation report" })).res.status).toBe(204);
    expect(await state()).toBe("unverified");
    expect((await decide({ decision: "verify" })).res.status).toBe(204); // the note is optional
    expect(await state()).toBe("verified");

    const log = await call(admin(["audit-log"]), { jar, url: `/api/admin/audit-log?targetId=${id}&limit=20` });
    const entries = log.json.entries.map((e: any) => [e.action, e.reason]);
    expect(entries).toEqual(expect.arrayContaining([["artist.verify", "Checked ID by phone"], ["artist.revoke", "Impersonation report"]]));
  });

  it("refuses a banned artist, and needs the CSRF token", async () => {
    const jar: Jar = { cookie: "" };
    const login = await call(handleLogin, { method: "POST", body: { email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }, jar });
    const s = { jar, csrf: login.json.csrf as string };
    const made = await call(admin(["artists"]), { method: "POST", body: { name: "Banned One" }, ...s });
    await call(admin(["artists", made.json.id, "ban"]), { method: "POST", body: { reason: "Copyright complaint" }, ...s });
    const r = await call(admin(["artists", made.json.id, "verification"]), { method: "POST", body: { decision: "verify" }, ...s });
    expect(r.res.status).toBe(409);
    expect(r.json.error.code).toBe("artist_banned");
    const noToken = await call(admin(["artists", made.json.id, "verification"]), { method: "POST", body: { decision: "verify" }, jar });
    expect(noToken.res.status).toBe(403);
  });
});
