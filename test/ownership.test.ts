/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// Transferring a catalog artist to a user and removing an artist from a user: the rules, and the real handlers against the mock.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { cannotReceive, ownershipError } from "@/lib/ownership";
import { handleAdminProxy, handleLogin } from "@/server/handlers";

describe("ownership rules", () => {
  it("offers only accounts that can receive an artist, and says why not", () => {
    const ok = { banned: false, hasArtist: false, emailVerified: true };
    expect(cannotReceive(ok)).toBeNull();
    expect(cannotReceive({ ...ok, banned: true })).toMatch(/banned/);
    expect(cannotReceive({ ...ok, hasArtist: true })).toMatch(/Already has an artist/);
    expect(cannotReceive({ ...ok, emailVerified: false })).toMatch(/confirmed their email/);
  });
  it("explains refusals, including an older server", () => {
    expect(ownershipError("not_available", "x")).toMatch(/latest Backend update/);
    expect(ownershipError("user_has_artist", "x")).toMatch(/one artist/);
    expect(ownershipError("already_owned", "x")).toMatch(/Remove it/);
    expect(ownershipError("something_else", "kept")).toBe("kept");
  });
});

const ORIGIN = "http://localhost:3100";
let mock: Mock;
beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "owner-secret-owner-secret-owner-secret-12";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});

describe("transfer and remove through the site", () => {
  async function client() {
    const login = await handleLogin(
      new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }) }),
    );
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const csrf = ((await login.json()) as any).csrf as string;
    return async (path: string, method = "GET", body?: unknown, withCsrf = true) => {
      const [route, query] = path.split("?");
      const headers: Record<string, string> = { origin: ORIGIN, cookie, "content-type": "application/json", ...(withCsrf ? { "x-csrf-token": csrf } : {}) };
      const res = await handleAdminProxy(new Request(`${ORIGIN}/api/admin/${route}${query ? `?${query}` : ""}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), route!.split("/"));
      const text = await res.text();
      return { status: res.status, json: (text ? JSON.parse(text) : undefined) as any };
    };
  }

  it("gives a catalog artist to a user, refuses a second owner, removes it again, and audits both", async () => {
    const admin = await client();
    const users = (await admin("users?limit=100")).json.users as any[];
    const [first, second] = users.filter((u) => u.role === "user" && !cannotReceive(u));
    const taken = users.find((u) => u.hasArtist && !u.banned && u.emailVerified);
    const id = (await admin("artists", "POST", { name: "Waiting For Owner" })).json.id as string;
    const owner = (body: unknown, method = "POST", csrf = true) => admin(`artists/${id}/owner`, method, body, csrf);

    expect((await owner({ userId: first.id, reason: "Checked by phone" }, "POST", false)).status).toBe(403);
    expect((await owner({ userId: first.id, reason: "x" })).status).toBe(422);
    expect((await owner({ userId: taken.id, reason: "Checked by phone" })).json.error.code).toBe("user_has_artist");

    const given = await owner({ userId: first.id, reason: "Checked by phone" });
    expect(given.status).toBe(200);
    expect(given.json.owner.email).toBe(first.email);
    expect(given.json.storage.quotaBytes).toBeGreaterThan(0);
    expect((await owner({ userId: second.id, reason: "Another person" })).json.error.code).toBe("already_owned");
    const preview = await admin(`users/${first.id}/deletion-preview`);
    expect(preview.json.artist.returnsToCatalog).toBe(true);

    const removed = await owner({ reason: "Wrong account" }, "DELETE");
    expect(removed.status).toBe(200);
    expect(removed.json.owner).toBeNull();
    expect((await owner({ reason: "Again" }, "DELETE")).json.error.code).toBe("not_owned");

    const log = await admin(`audit-log?targetId=${id}&limit=20`);
    const rows = log.json.entries.map((e: any) => [e.action, e.reason]);
    expect(rows).toEqual(expect.arrayContaining([["artist.assign", "Checked by phone"], ["artist.unassign", "Wrong account"]]));
  });

  it("keeps a transferred artist when its user's account is deleted", async () => {
    const admin = await client();
    const user = ((await admin("users?limit=100")).json.users as any[]).find((u) => u.role === "user" && !cannotReceive(u));
    const id = (await admin("artists", "POST", { name: "Outlives The Account" })).json.id as string;
    await admin(`artists/${id}/owner`, "POST", { userId: user.id, reason: "Checked in person" });
    expect((await admin(`users/${user.id}`, "DELETE", { reason: "Asked to leave", confirmEmail: user.email })).status).toBe(204);
    const after = await admin(`artists/${id}`);
    expect(after.status).toBe(200);
    expect(after.json.owner).toBeNull();
  });
});
