/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// Managing the metadata lists: nothing is deleted, and tracks keep what they have.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { offered, payload, toDraft, type Taxonomy, type TrackMetadata } from "@/lib/metadata";
import { canManage, createBody, formOf, nameProblem, parentChoices, patchBody, rows, usableGenre } from "@/lib/taxonomy";
import { handleAdminProxy, handleLogin } from "@/server/handlers";

const term = (id: string, extra = {}) => ({ id, label: id, active: true, ...extra });
const tax = {
  languageGroups: [{ id: "g1", label: "g1" }, { id: "g2", label: "g2" }],
  languages: [term("b", { groupId: "g2" }), term("none", { groupId: null }), term("a", { groupId: "g1" })],
  cultures: [],
  regions: [],
  genres: [term("gospel", { parentId: null }), term("pop", { parentId: null }), term("praise", { parentId: "gospel" }), term("old", { parentId: null, active: false })],
  attributes: { mood: [], energy: [], danceability: [], instrumentation: [] },
} as unknown as Taxonomy;

describe("list rules", () => {
  it("shows languages by group and subgenres under their genre", () => {
    expect(rows(tax, "languages").map((r) => r.entry.id)).toEqual(["a", "b", "none"]);
    expect(rows(tax, "genres").map((r) => [r.entry.id, r.depth])).toEqual([["gospel", 0], ["praise", 1], ["pop", 0], ["old", 0]]);
    expect(rows(tax, "genres", "PRAI").map((r) => r.entry.id)).toEqual(["praise"]);
  });
  it("keeps subgenres one level deep", () => {
    const [gospel, , praise] = tax.genres;
    expect(parentChoices(tax, gospel)).toEqual([]);
    expect(parentChoices(tax, praise).map((g) => g.id)).toEqual(["gospel", "pop"]);
  });
  it("sends only what changed, with the fields the list has", () => {
    const a = tax.languages[2]!;
    expect(patchBody("languages", a, formOf(a))).toBeNull();
    expect(patchBody("languages", a, { ...formOf(a), groupId: "" })).toEqual({ groupId: null });
    expect(createBody("regions", { label: " North ", groupId: "g1", parentId: "pop" })).toEqual({ label: "North" });
    expect(nameProblem("regions", "  ")).not.toBe("");
    expect(nameProblem("genres", "x".repeat(41))).not.toBe("");
    expect(nameProblem("cultures", "x".repeat(41))).toBe("");
  });
  it("does not send a switched-off genre", () => {
    expect(usableGenre("Gospel", [{ name: "gospel" }])).toBe("Gospel");
    expect(usableGenre("Old", [{ name: "Gospel" }])).toBe("");
    expect(usableGenre("Old", undefined)).toBe("Old");
  });
  it("can manage only when the server counts usage", () => {
    expect(canManage(tax)).toBe(false);
  });
});

const ORIGIN = "http://localhost:3100";
let mock: Mock;
beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "taxonomy-secret-taxonomy-secret-123456";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});

describe("changing the lists through the site", () => {
  it("adds, renames and deactivates without breaking tracks", async () => {
    const login = await handleLogin(new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }) }));
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const csrf = ((await login.json()) as any).csrf as string;
    const call = async (path: string, method = "GET", body?: unknown) => {
      const [route, query] = path.split("?");
      const res = await handleAdminProxy(new Request(`${ORIGIN}/api/admin/${route}${query ? `?${query}` : ""}`, { method, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), route!.split("/"));
      const text = await res.text();
      return { status: res.status, json: (text ? JSON.parse(text) : undefined) as any };
    };
    const lists = async () => (await call("taxonomy?usage=true")).json as Taxonomy;
    expect(canManage(await lists())).toBe(true);

    const made = await call("taxonomy/cultures", "POST", { label: "Bagisu" });
    expect(made.status).toBe(201);
    expect((await call("taxonomy/cultures", "POST", { label: " bagisu " })).json.error.code).toBe("duplicate_label");

    const release = (await call("releases?type=album&limit=100")).json.releases.find((r: any) => r.trackCount > 0);
    const read = async () => (await call(`releases/${release.id}/track-metadata`)).json.tracks[0] as TrackMetadata;
    const t = await read();
    await call(`tracks/${t.trackId}/metadata`, "PUT", payload({ ...toDraft(t), cultures: [made.json.id] }, t.version));

    expect((await call(`taxonomy/cultures/${made.json.id}`, "PATCH", { label: "Bamasaaba", active: false })).status).toBe(200);
    const after = await lists();
    const entry = after.cultures.find((c) => c.id === made.json.id)!;
    expect(entry).toMatchObject({ id: made.json.id, label: "Bamasaaba", active: false, usage: 1 });
    const kept = await read();
    expect(kept.cultures.map((c) => c.id)).toEqual([made.json.id]); // the track keeps it
    expect(offered(after.cultures, []).some((c) => c.id === made.json.id)).toBe(false); // but it cannot be newly chosen

    expect((await call(`taxonomy/cultures/${made.json.id}`, "DELETE")).status).not.toBe(204);
  });
});
