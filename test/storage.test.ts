/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// The artist page's storage card: no limit for catalog artists, an honest bar for artists with an account.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { allowance, breakdownRows, totalBytes } from "@/lib/storage";
import { handleAdminProxy, handleLogin } from "@/server/handlers";

const MB = 1024 * 1024;

describe("artist storage rules", () => {
  it("gives a catalog artist no limit, whatever the quota says", () => {
    expect(allowance({ usedBytes: 109 * MB, quotaBytes: 0 }, false)).toEqual({ limited: false });
  });

  it("never reads as 0% when something is stored and nothing is allowed", () => {
    expect(allowance({ usedBytes: 109 * MB, quotaBytes: 0 }, true)).toEqual({ limited: true, percent: 100, over: true, freeBytes: 0 });
    expect(allowance({ usedBytes: 0, quotaBytes: 0 }, true)).toEqual({ limited: true, percent: 0, over: false, freeBytes: 0 });
    expect(allowance({ usedBytes: 256 * MB, quotaBytes: 1024 * MB }, true)).toEqual({ limited: true, percent: 25, over: false, freeBytes: 768 * MB });
    expect(allowance({ usedBytes: 2048 * MB, quotaBytes: 1024 * MB }, true)).toMatchObject({ percent: 100, over: true, freeBytes: 0 });
  });

  it("shows the breakdown only when the server sends it", () => {
    expect(breakdownRows({ usedBytes: 1, quotaBytes: 0 })).toBeNull();
    const f = (files: number, bytes: number) => ({ files, bytes });
    const rows = breakdownRows({ usedBytes: 30, quotaBytes: 0, breakdown: { publishedAudio: f(1, 10), unpublishedAudio: f(2, 20), unfinishedUploads: f(0, 0), playbackAudio: f(9, 12), pictures: f(3, 3) } })!;
    expect(rows.map((r) => r.key)).toEqual(["publishedAudio", "unpublishedAudio", "unfinishedUploads", "playbackAudio", "pictures"]);
    expect(totalBytes(rows)).toBe(45);
  });
});

const ORIGIN = "http://localhost:3100";
let mock: Mock;
beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "storage-secret-storage-secret-storage-12";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});

describe("artist storage through the site", () => {
  it("sends no allowance for catalog artists, and a breakdown whose uploads add up to the used figure", async () => {
    const login = await handleLogin(
      new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }) }),
    );
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const get = async (path: string, query = "") => (await (await handleAdminProxy(new Request(`${ORIGIN}/api/admin/${path}${query}`, { headers: { cookie } }), path.split("/"))).json()) as any;
    const artists = (await get("artists", "?limit=100")).artists as any[];
    for (const who of [artists.find((a) => !a.ownerUserId), artists.find((a) => a.ownerUserId)]) {
      const d = await get(`artists/${who.id}`);
      const b = d.storage.breakdown;
      expect(b.publishedAudio.bytes + b.unpublishedAudio.bytes + b.unfinishedUploads.bytes).toBe(d.storage.usedBytes);
      if (!who.ownerUserId) expect(d.storage.quotaBytes).toBe(0);
    }
  });
});
