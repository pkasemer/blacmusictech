/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// Integration: sections, cover upload, playback and search insights through the real BFF handlers and the mock Backend.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { handleAdminProxy, handleImageUpload, handleLogin, handlePlayback, loginByEmail, loginByIp } from "@/server/handlers";

const ORIGIN = "http://localhost:3100";
let mock: Mock;

interface Jar {
  cookie: string;
}

function absorb(j: Jar, res: Response): void {
  for (const c of res.headers.getSetCookie()) {
    const [pair = ""] = c.split(";");
    const [name = "", value = ""] = pair.split("=");
    j.cookie = /Max-Age=0/i.test(c) || value === "" ? "" : `${name}=${value}`;
  }
}

async function call(
  fn: (req: Request) => Promise<Response>,
  url: string,
  o: { method?: string; body?: unknown; raw?: { bytes: Uint8Array; type: string }; jar?: Jar; csrf?: string } = {},
): Promise<{ res: Response; json: any }> {
  const headers: Record<string, string> = {};
  if (o.body !== undefined) headers["content-type"] = "application/json";
  if (o.raw) headers["content-type"] = o.raw.type;
  if (o.jar?.cookie) headers.cookie = o.jar.cookie;
  if (o.csrf) headers["x-csrf-token"] = o.csrf;
  if ((o.method ?? "GET") !== "GET") headers.origin = ORIGIN;
  const body = o.raw ? (o.raw.bytes as unknown as BodyInit) : o.body === undefined ? undefined : JSON.stringify(o.body);
  const res = await fn(new Request(`${ORIGIN}${url}`, { method: o.method ?? "GET", headers, body }));
  if (o.jar) absorb(o.jar, res);
  const text = await res.text();
  return { res, json: text ? JSON.parse(text) : undefined };
}

const admin = (path: string[]) => (req: Request) => handleAdminProxy(req, path);

async function signIn(): Promise<{ jar: Jar; csrf: string }> {
  const jar: Jar = { cookie: "" };
  const r = await call(handleLogin, "/api/auth/login", { method: "POST", body: { email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }, jar });
  expect(r.res.status).toBe(200);
  return { jar, csrf: r.json.csrf };
}

beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "features-secret-features-secret-123456";
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

// a 1x1 PNG
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

describe("sections", () => {
  it("lists sections, creates one, and a playlist can be in several sections", async () => {
    const { jar, csrf } = await signIn();
    const list = await call(admin(["playlist-groups"]), "/x", { jar });
    expect(list.res.status).toBe(200);
    expect(list.json.groups.map((g: { id: string }) => g.id)).toEqual(expect.arrayContaining(["workout", "chill"]));
    const created = await call(admin(["playlist-groups"]), "/x", { method: "POST", body: { title: "Late Night", description: "After dark" }, jar, csrf });
    expect(created.res.status).toBe(201);
    expect(created.json.id).toBe("late-night");
    const dup = await call(admin(["playlist-groups"]), "/x", { method: "POST", body: { title: "Late Night" }, jar, csrf });
    expect(dup.res.status).toBe(409);

    // pl_workout is already in workout and chill: add it to the new section too
    const put = await call(admin(["playlist-groups", "late-night", "playlists"]), "/x", { method: "PUT", body: { playlistIds: ["pl_workout", "pl_chill"] }, jar, csrf });
    expect(put.res.status).toBe(200);
    expect(put.json.playlistIds).toEqual(["pl_workout", "pl_chill"]);
    const pl = await call(admin(["playlists", "pl_workout"]), "/x", { jar });
    expect(pl.json.groups.map((g: { id: string }) => g.id).sort()).toEqual(["chill", "late-night", "workout"]);
  });

  it("reorders members, hides a section, rejects unknown playlists, and deletes", async () => {
    const { jar, csrf } = await signIn();
    const put = await call(admin(["playlist-groups", "workout", "playlists"]), "/x", { method: "PUT", body: { playlistIds: ["pl_new", "pl_workout"] }, jar, csrf });
    expect(put.json.playlistIds).toEqual(["pl_new", "pl_workout"]);
    expect((await call(admin(["playlist-groups", "workout", "playlists"]), "/x", { method: "PUT", body: { playlistIds: ["pl_nope"] }, jar, csrf })).res.status).toBe(422);
    expect((await call(admin(["playlist-groups", "workout", "playlists"]), "/x", { method: "PUT", body: {}, jar, csrf })).res.status).toBe(400);
    const patch = await call(admin(["playlist-groups", "chill"]), "/x", { method: "PATCH", body: { isActive: false, position: 5 }, jar, csrf });
    expect(patch.json).toMatchObject({ isActive: false, position: 5 });
    const del = await call(admin(["playlist-groups", "coming-soon"]), "/x", { method: "DELETE", jar, csrf });
    expect(del.res.status).toBe(204);
    expect((await call(admin(["playlist-groups", "coming-soon"]), "/x", { jar })).res.status).toBe(404);
    const log = await call(admin(["audit-log"]), "/api/admin/audit-log?action=section", { jar });
    expect(log.json.entries.map((e: { action: string }) => e.action)).toEqual(expect.arrayContaining(["section.delete", "section.update", "section.playlists"]));
  });

  it("needs the CSRF token to change a section", async () => {
    const { jar } = await signIn();
    const r = await call(admin(["playlist-groups"]), "/x", { method: "POST", body: { title: "Nope" }, jar });
    expect(r.res.status).toBe(403);
  });
});

describe("cover upload", () => {
  it("uploads an image through the server, then sets it as the playlist cover and can remove it", async () => {
    const { jar, csrf } = await signIn();
    const up = await call(handleImageUpload, "/api/images", { method: "POST", raw: { bytes: PNG, type: "image/png" }, jar, csrf });
    expect(up.res.status).toBe(200);
    expect(up.json.status).toBe("ready");
    expect(up.json.id).toMatch(/^img_/);
    const set = await call(admin(["playlists", "pl_chill"]), "/x", { method: "PATCH", body: { coverImageId: up.json.id }, jar, csrf });
    expect(set.res.status).toBe(200);
    expect(set.json.coverUrl).toContain(up.json.id);
    const img = await fetch(set.json.coverUrl);
    expect(img.status).toBe(200);
    const rm = await call(admin(["playlists", "pl_chill"]), "/x", { method: "PATCH", body: { coverImageId: "" }, jar, csrf });
    expect(rm.json.coverUrl).toBeUndefined();
    expect((await call(admin(["playlists", "pl_chill"]), "/x", { method: "PATCH", body: { coverImageId: "img_unknown" }, jar, csrf })).res.status).toBe(422);
  });

  it("refuses wrong types, empty and oversized bodies, and requests without a session or CSRF token", async () => {
    const { jar, csrf } = await signIn();
    expect((await call(handleImageUpload, "/api/images", { method: "POST", raw: { bytes: PNG, type: "text/html" }, jar, csrf })).res.status).toBe(415);
    expect((await call(handleImageUpload, "/api/images", { method: "POST", raw: { bytes: new Uint8Array(0), type: "image/png" }, jar, csrf })).res.status).toBe(400);
    expect((await call(handleImageUpload, "/api/images", { method: "POST", raw: { bytes: new Uint8Array((10 << 20) + 1), type: "image/jpeg" }, jar, csrf })).res.status).toBe(413);
    expect((await call(handleImageUpload, "/api/images", { method: "POST", raw: { bytes: PNG, type: "image/png" }, jar })).res.status).toBe(403);
    expect((await call(handleImageUpload, "/api/images", { method: "POST", raw: { bytes: PNG, type: "image/png" } })).res.status).toBe(401);
    expect((await call(handleImageUpload, "/api/images", { method: "GET", jar })).res.status).toBe(405);
  });
});

describe("playback", () => {
  it("returns a playable link for a public track and refuses ids that are not tracks", async () => {
    const { jar } = await signIn();
    const pub = mock.state.tracks.find((t) => mock.state.releases.find((r) => r.id === t.releaseId)?.visibility === "public")!;
    const ok = await call((r) => handlePlayback(r, pub.id), `/api/playback/${pub.id}`, { jar });
    expect(ok.res.status).toBe(200);
    expect(ok.json.playback.mode).toBe("url");
    expect(ok.json.playback.url).toContain("/mock-audio/");
    const audio = await fetch(ok.json.playback.url, { headers: { range: "bytes=0-99" } });
    expect(audio.status).toBe(206);
    expect((await audio.arrayBuffer()).byteLength).toBe(100);

    for (const bad of ["../v1/me", "trk_x/../../me", "epi_1", "abc", "trk_" + "a".repeat(80)]) {
      const r = await call((req) => handlePlayback(req, bad), "/api/playback/x", { jar });
      expect(r.res.status).toBe(404);
    }
    const draft = mock.state.tracks.find((t) => mock.state.releases.find((r) => r.id === t.releaseId)?.visibility !== "public")!;
    const hidden = await call((r) => handlePlayback(r, draft.id), `/api/playback/${draft.id}`, { jar });
    expect(hidden.res.status).toBe(404);
    expect((await call((r) => handlePlayback(r, pub.id), "/api/playback/x")).res.status).toBe(401);
  });
});

describe("search insights", () => {
  it("serves the overview, rankings, content gaps and daily series", async () => {
    const { jar } = await signIn();
    const o = await call(admin(["search", "overview"]), "/api/admin/search/overview?range=30d", { jar });
    expect(o.json.searches).toBeGreaterThan(1000);
    expect(o.json.noResultRate).toBeGreaterThan(0);
    expect(o.json.noResultRate).toBeLessThan(1);
    const top = await call(admin(["search", "top"]), "/api/admin/search/top?range=30d&limit=5", { jar });
    expect(top.json.items).toHaveLength(5);
    expect(top.json.items[0].count).toBeGreaterThanOrEqual(top.json.items[1].count);
    const filtered = await call(admin(["search", "top"]), "/api/admin/search/top?range=7d&kind=artists", { jar });
    expect(filtered.json.total).toBeGreaterThan(0);
    const rising = await call(admin(["search", "top"]), "/api/admin/search/top?range=30d&sort=rising", { jar });
    expect(rising.json.items.every((i: { count: number; previousCount: number }) => i.count > i.previousCount)).toBe(true);
    const gaps = await call(admin(["search", "no-results"]), "/api/admin/search/no-results?range=30d", { jar });
    expect(gaps.json.items.length).toBeGreaterThan(0);
    const ts = await call(admin(["stats", "timeseries"]), "/api/admin/stats/timeseries?metric=searches&from=2026-11-01&to=2026-11-07&bucket=day", { jar });
    expect(ts.json.points).toHaveLength(7);
    const ts2 = await call(admin(["stats", "timeseries"]), "/api/admin/stats/timeseries?metric=searches_no_results&from=2026-11-01&to=2026-11-07&bucket=day", { jar });
    expect(ts2.json.points[0].count).toBeLessThan(ts.json.points[0].count);
  });
});
