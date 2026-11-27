/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { albumKind, combineError, defaultVisibility, keepOrder, move, visibilityWarning } from "@/lib/combine";
import { handleAdminProxy, handleLogin } from "@/server/handlers";

describe("combining rules", () => {
  it("names the result, keeps the admin's order and never publishes by itself", () => {
    expect([albumKind(2), albumKind(6), albumKind(7)]).toEqual(["EP", "EP", "album"]);
    expect(keepOrder(["c", "a", "x"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
    expect(move(["a", "b"], 0, 1)).toEqual(["b", "a"]);
    expect(move(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(defaultVisibility([{ visibility: "public" }, { visibility: "draft" }])).toBe("draft");
    expect(visibilityWarning([{ visibility: "public" }], "draft")).toMatch(/will not see them/);
    expect(visibilityWarning([{ visibility: "draft" }], "public")).toMatch(/makes them public/);
    expect(visibilityWarning([{ visibility: "public" }], "public")).toBeNull();
    expect(combineError("error", 405, "x")).toMatch(/latest Backend update/);
  });
});

const ORIGIN = "http://localhost:3100";
let mock: Mock;
beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "combine-secret-combine-secret-combine-12";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});

describe("combining through the site", () => {
  it("moves every song into the new release and removes the originals", async () => {
    const login = await handleLogin(new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }) }));
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const csrf = ((await login.json()) as any).csrf as string;
    const call = async (path: string, method = "GET", body?: unknown) => {
      const [route, query] = path.split("?");
      const res = await handleAdminProxy(new Request(`${ORIGIN}/api/admin/${route}${query ? `?${query}` : ""}`, { method, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), route!.split("/"));
      const text = await res.text();
      return { status: res.status, json: (text ? JSON.parse(text) : undefined) as any };
    };
    const all = (await call("releases?limit=100")).json.releases.filter((r: any) => !r.takenDown && r.trackCount > 0);
    const artistId = all.find((r: any) => all.filter((x: any) => x.artistId === r.artistId).length >= 2).artistId;
    const [one, two] = all.filter((r: any) => r.artistId === artistId);
    const songs = [...(await call(`releases/${one.id}`)).json.tracks, ...(await call(`releases/${two.id}`)).json.tracks].map((t: any) => t.id);
    const body = { releaseIds: [one.id, two.id], title: "Together", trackIds: [...songs].reverse(), visibility: "draft" };
    expect((await call("releases/combine", "POST", { ...body, trackIds: songs.slice(1) })).status).toBe(422);
    const made = await call("releases/combine", "POST", body);
    expect(made.status).toBe(201);
    expect((await call(`releases/${made.json.id}`)).json.tracks).toHaveLength(songs.length);
    expect((await call(`releases/${one.id}`)).status).toBe(404);

    // and back: one song out as its own single
    const split = await call(`tracks/${songs[0]}/single`, "POST", { title: "On Its Own", visibility: "draft" });
    expect(split.status).toBe(201);
    expect((await call(`releases/${split.json.id}`)).json.tracks.map((t: any) => t.id)).toEqual([songs[0]]);
    expect((await call(`releases/${made.json.id}`)).json.tracks).toHaveLength(songs.length - 1);
    expect((await call(`tracks/${songs[0]}/single`, "POST", { title: "Again", visibility: "draft" })).json.error.code).toBe("already_single");
  });
});
