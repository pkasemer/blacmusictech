/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// Integration: an admin creates an artist and a release and uploads audio, through the real handlers and the mock Backend.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { handleAdminProxy, handleGenres, handleImageUpload, handleLogin, handleUploadCreate, handleUploadPart, handleUploadParts, loginByEmail, loginByIp } from "@/server/handlers";

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
  o: { method?: string; body?: unknown; raw?: Uint8Array; type?: string; jar?: Jar; csrf?: string } = {},
): Promise<{ res: Response; json: any }> {
  const headers: Record<string, string> = {};
  if (o.body !== undefined) headers["content-type"] = "application/json";
  if (o.raw) headers["content-type"] = o.type ?? "application/octet-stream";
  if (o.jar?.cookie) headers.cookie = o.jar.cookie;
  if (o.csrf) headers["x-csrf-token"] = o.csrf;
  if ((o.method ?? "GET") !== "GET") headers.origin = ORIGIN;
  const body = o.raw ? (o.raw as unknown as BodyInit) : o.body === undefined ? undefined : JSON.stringify(o.body);
  if (o.raw) headers["content-length"] = String(o.raw.length);
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
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const MB = 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "create-secret-create-secret-create-1234";
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

describe("create an artist", () => {
  it("creates an artist without an account, with a picture, and audits it", async () => {
    const { jar, csrf } = await signIn();
    const img = await call(handleImageUpload, "/api/images?purpose=avatar", { method: "POST", raw: PNG, type: "image/png", jar, csrf });
    expect(img.json.status).toBe("ready");
    const bad = await call(admin(["artists"]), "/x", { method: "POST", body: { name: "" }, jar, csrf });
    expect(bad.res.status).toBe(422);
    const made = await call(admin(["artists"]), "/x", { method: "POST", body: { name: "Nyota Moon", bio: "New voice from Gulu", imageId: img.json.id }, jar, csrf });
    expect(made.res.status).toBe(201);
    expect(made.json.owner).toBeNull();
    expect(made.json.imageUrl).toContain(img.json.id);
    const list = await call(admin(["artists"]), "/api/admin/artists?q=nyota", { jar });
    expect(list.json.artists[0]).toMatchObject({ name: "Nyota Moon", verification: "unverified" });
    expect(list.json.artists[0].ownerEmail).toBeUndefined();
    const log = await call(admin(["audit-log"]), "/api/admin/audit-log?action=artist.create", { jar });
    expect(log.json.entries[0]).toMatchObject({ action: "artist.create", targetLabel: "Nyota Moon" });
  });

  it("refuses a picture that is not the administrator's own finished image", async () => {
    const { jar, csrf } = await signIn();
    const r = await call(admin(["artists"]), "/x", { method: "POST", body: { name: "Ghost Pic", imageId: "img_doesnotexist" }, jar, csrf });
    expect(r.res.status).toBe(422);
  });
});

describe("create a release and add audio", () => {
  async function newRelease(type: "single" | "album") {
    const s = await signIn();
    const artist = await call(admin(["artists"]), "/x", { method: "POST", body: { name: `Artist ${Math.random().toString(36).slice(2, 6)}` }, ...s });
    const rel = await call(admin(["artists", artist.json.id, "releases"]), "/x", { method: "POST", body: { type, title: "Golden Hour", genre: "Afrobeats", releaseDate: "2026-12-01" }, ...s });
    expect(rel.res.status).toBe(201);
    expect(rel.json.visibility).toBe("draft");
    expect(rel.json.tracks).toEqual([]);
    return { ...s, artistId: artist.json.id as string, releaseId: rel.json.id as string };
  }
  const start = (s: { jar: Jar; csrf: string }, releaseId: string, size: number, extra: Record<string, unknown> = {}) =>
    call(handleUploadCreate, "/api/uploads", { method: "POST", body: { releaseId, title: "Golden Hour", filename: "golden.wav", sizeBytes: size, rightsConfirmed: true, ...extra }, ...s });
  const waitReady = async (s: { jar: Jar }, uploadId: string) => {
    for (let i = 0; i < 40; i++) {
      const u = await call(admin(["uploads", uploadId]), "/x", { jar: s.jar });
      if (u.json.status === "ready" || u.json.status === "failed") return u.json;
      await sleep(150);
    }
    throw new Error("upload never settled");
  };

  it("validates a new release and rejects unknown artists", async () => {
    const { jar, csrf } = await signIn();
    expect((await call(admin(["artists", "art_nope", "releases"]), "/x", { method: "POST", body: { type: "single", title: "x" }, jar, csrf })).res.status).toBe(404);
    const a = await call(admin(["artists"]), "/x", { method: "POST", body: { name: "Validator" }, jar, csrf });
    for (const body of [{ type: "single", title: "" }, { type: "ep", title: "Hi" }, { type: "single", title: "Hi", releaseDate: "tomorrow" }]) {
      expect((await call(admin(["artists", a.json.id, "releases"]), "/x", { method: "POST", body, jar, csrf })).res.status).toBe(422);
    }
  });

  it("uploads a single-file track end to end, hides storage addresses, and publishes", async () => {
    const s = await newRelease("single");
    const none = await call(admin(["releases", s.releaseId, "publish"]), "/x", { method: "POST", body: {}, ...s });
    expect(none.res.status).toBe(422);
    expect(none.json.error.code).toBe("no_tracks");

    const started = await start(s, s.releaseId, 3 * MB);
    expect(started.res.status).toBe(201);
    expect(JSON.stringify(started.json)).not.toMatch(/mock-storage|127\.0\.0\.1|https?:/);
    expect(started.json.plan).toMatchObject({ type: "single", partCount: 1 });
    const token = started.json.plan.parts[0].token as string;

    // wrong size, forged token, and a token from another session are all refused before storage is touched
    const wrongSize = await call(handleUploadPart, `/api/uploads/part?token=${encodeURIComponent(token)}`, { method: "PUT", raw: new Uint8Array(4 * MB), ...s });
    expect(wrongSize.res.status).toBe(422);
    expect((await call(handleUploadPart, "/api/uploads/part?token=garbage", { method: "PUT", raw: new Uint8Array(10), ...s })).res.status).toBe(403);
    const other = await signIn();
    expect((await call(handleUploadPart, `/api/uploads/part?token=${encodeURIComponent(token)}`, { method: "PUT", raw: new Uint8Array(3 * MB), ...other })).res.status).toBe(403);
    expect((await call(handleUploadPart, `/api/uploads/part?token=${encodeURIComponent(token)}`, { method: "PUT", raw: new Uint8Array(3 * MB), jar: s.jar })).res.status).toBe(403); // no CSRF token

    const early = await call(admin(["uploads", started.json.id, "complete"]), "/x", { method: "POST", ...s });
    expect(early.res.status).toBe(409);

    const ok = await call(handleUploadPart, `/api/uploads/part?token=${encodeURIComponent(token)}`, { method: "PUT", raw: new Uint8Array(3 * MB), ...s });
    expect(ok.res.status).toBe(204);
    const done = await call(admin(["uploads", started.json.id, "complete"]), "/x", { method: "POST", ...s });
    expect(done.res.status).toBe(200);
    const pending = await call(admin(["releases", s.releaseId]), "/x", { jar: s.jar });
    expect(pending.json.uploads.map((u: any) => u.id)).toContain(started.json.id);

    const final = await waitReady(s, started.json.id);
    expect(final.status).toBe("ready");
    const rel = await call(admin(["releases", s.releaseId]), "/x", { jar: s.jar });
    expect(rel.json.tracks).toHaveLength(1);
    expect(rel.json.tracks[0].title).toBe("Golden Hour");
    expect(rel.json.uploads).toEqual([]);

    const pub = await call(admin(["releases", s.releaseId, "publish"]), "/x", { method: "POST", body: {}, ...s });
    expect(pub.res.status).toBe(200);
    expect(pub.json.visibility).toBe("public");
    const log = await call(admin(["audit-log"]), "/api/admin/audit-log?targetType=release&limit=50", { jar: s.jar });
    const actions = log.json.entries.filter((e: any) => e.targetId === s.releaseId).map((e: any) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["release.create", "track.upload", "release.publish"]));
  });

  it("uploads a multi-part file with resume, and schedules instead of publishing when a future time is given", async () => {
    const s = await newRelease("album");
    const size = 17 * MB;
    const started = await start(s, s.releaseId, size, { title: "Long Song", filename: "long.wav" });
    expect(started.json.plan).toMatchObject({ type: "multipart", partSize: 8 * MB, partCount: 3 });
    const parts = started.json.plan.parts as { number: number; token: string }[];
    const put = (p: { number: number; token: string }, len: number) => call(handleUploadPart, `/api/uploads/part?token=${encodeURIComponent(p.token)}`, { method: "PUT", raw: new Uint8Array(len), ...s });

    expect((await put(parts[0]!, 5 * MB)).res.status).toBe(422); // a part must be exactly the planned size
    expect((await put(parts[0]!, 8 * MB)).res.status).toBe(204);
    expect((await put(parts[2]!, 1 * MB)).res.status).toBe(204);

    const early = await call(admin(["uploads", started.json.id, "complete"]), "/x", { method: "POST", ...s });
    expect(early.res.status).toBe(409);
    expect(early.json.error.code).toBe("parts_missing");

    // resume: ask what is missing, with fresh sealed links
    const again = await call((r) => handleUploadParts(r, started.json.id), `/api/uploads/${started.json.id}/parts?size=${size}`, { jar: s.jar });
    expect(again.res.status).toBe(200);
    expect(again.json.uploaded.sort()).toEqual([1, 3]);
    expect(again.json.parts.map((p: any) => p.number)).toEqual([2]);
    expect(JSON.stringify(again.json)).not.toMatch(/mock-storage|127\.0\.0\.1/);
    expect((await put(again.json.parts[0], 8 * MB)).res.status).toBe(204);

    expect((await call(admin(["uploads", started.json.id, "complete"]), "/x", { method: "POST", ...s })).res.status).toBe(200);
    expect((await waitReady(s, started.json.id)).status).toBe("ready");

    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const sched = await call(admin(["releases", s.releaseId, "publish"]), "/x", { method: "POST", body: { publishAt: later }, ...s });
    expect(sched.json.visibility).toBe("scheduled");
    const un = await call(admin(["releases", s.releaseId, "unpublish"]), "/x", { method: "POST", ...s });
    expect(un.json.visibility).toBe("draft");
  });

  it("requires the rights confirmation and sane input, and reports files the Backend cannot process", async () => {
    const s = await newRelease("single");
    expect((await start(s, s.releaseId, MB, { rightsConfirmed: false })).res.status).toBe(422);
    expect((await call(handleUploadCreate, "/api/uploads", { method: "POST", body: { releaseId: s.releaseId, title: "x", filename: "x.wav", sizeBytes: MB }, ...s })).res.status).toBe(422);
    expect((await start(s, "not-a-release", MB)).res.status).toBe(422);
    expect((await start(s, s.releaseId, 0)).res.status).toBe(422);
    expect((await call(handleUploadCreate, "/api/uploads", { method: "POST", body: { releaseId: s.releaseId, title: "x", filename: "x.wav", sizeBytes: MB, rightsConfirmed: true }, jar: s.jar })).res.status).toBe(403);
    expect((await call(handleUploadCreate, "/api/uploads", { method: "POST", body: { releaseId: s.releaseId, title: "x", filename: "x.wav", sizeBytes: MB, rightsConfirmed: true } })).res.status).toBe(401);

    const bad = await start(s, s.releaseId, MB, { filename: "broken-file.wav", title: "Broken" });
    await call(handleUploadPart, `/api/uploads/part?token=${encodeURIComponent(bad.json.plan.parts[0].token)}`, { method: "PUT", raw: new Uint8Array(MB), ...s });
    await call(admin(["uploads", bad.json.id, "complete"]), "/x", { method: "POST", ...s });
    const final = await waitReady(s, bad.json.id);
    expect(final.status).toBe("failed");
    expect(final.error).toBeTruthy();
    expect((await call(admin(["uploads", bad.json.id]), "/x", { method: "DELETE", ...s })).res.status).toBe(204);
  });

  it("serves the genre list and edits the new release's cover and date", async () => {
    const s = await newRelease("single");
    const g = await call(handleGenres, "/api/genres", { jar: s.jar });
    expect(g.json.genres.length).toBeGreaterThan(3);
    const img = await call(handleImageUpload, "/api/images?purpose=cover", { method: "POST", raw: PNG, type: "image/png", ...s });
    const patched = await call(admin(["releases", s.releaseId]), "/x", { method: "PATCH", body: { coverImageId: img.json.id, releaseDate: "2027-01-15" }, ...s });
    expect(patched.res.status).toBe(200);
    expect(patched.json.coverUrl).toContain(img.json.id);
    expect((await call(admin(["releases", s.releaseId]), "/x", { method: "PATCH", body: { releaseDate: "soon" }, ...s })).res.status).toBe(422);
  });
});
