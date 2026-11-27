/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { canFeature, featuredSupported } from "@/lib/featured";
import { handleAdminProxy, handleLogin } from "@/server/handlers";

describe("featured rules", () => {
  it("never takes an older server's full list for the featured one", () => {
    expect(featuredSupported({ total: 1, releases: [{ id: "a" } as any] })).toBe(false);
    expect(featuredSupported({ total: 1, releases: [{ id: "a", featured: true } as any] })).toBe(true);
    expect(canFeature({ type: "single", takenDown: false, featured: false })).toBe(false);
    expect(canFeature({ type: "album", takenDown: false })).toBe(false);
    expect(canFeature({ type: "album", takenDown: false, featured: false })).toBe(true);
  });
});

const ORIGIN = "http://localhost:3100";
let mock: Mock;
beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "featured-secret-featured-secret-featured";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});

describe("featuring through the site", () => {
  it("features, reorders and removes", async () => {
    const login = await handleLogin(new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }) }));
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const csrf = ((await login.json()) as any).csrf as string;
    const call = async (path: string, method = "GET", body?: unknown) => {
      const [route, query] = path.split("?");
      const res = await handleAdminProxy(new Request(`${ORIGIN}/api/admin/${route}${query ? `?${query}` : ""}`, { method, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), route!.split("/"));
      const text = await res.text();
      return { status: res.status, json: (text ? JSON.parse(text) : undefined) as any };
    };
    const [a, b] = (await call("releases?type=album&takenDown=false&limit=100")).json.releases;
    expect((await call(`releases/${a.id}/featured`, "PUT")).status).toBe(200);
    await call(`releases/${b.id}/featured`, "PUT");
    expect((await call("featured-releases/order", "PUT", { releaseIds: [b.id, a.id] })).status).toBe(204);
    const list = async () => (await call("releases?featured=true&limit=100")).json.releases.map((r: any) => r.id);
    expect(await list()).toEqual([b.id, a.id]);
    await call(`releases/${b.id}/featured`, "DELETE");
    expect(await list()).toEqual([a.id]);
  });
});
