/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// Track enrichment: the editing rules, and saving and reading metadata through the site against the mock.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { completion, offered, payload, sameDraft, setLanguageRole, setPrimaryGenre, setUnknownLanguage, termLabel, toDraft, withGenres, withLanguages, type Draft, type TrackMetadata } from "@/lib/metadata";
import { handleAdminProxy, handleLogin } from "@/server/handlers";

const empty: Draft = { languageUnknown: false, languages: [], cultures: [], regions: [], genres: [], attributes: { mood: [], energy: [], danceability: [], instrumentation: [] } };

describe("editing rules", () => {
  it("keeps one primary language, and unknown excludes languages", () => {
    let d = withLanguages(empty, ["luganda", "english"]);
    expect(d.languages).toEqual([{ id: "luganda", role: "primary" }, { id: "english", role: "secondary" }]);
    d = setLanguageRole(d, "english", "primary");
    expect(d.languages.filter((l) => l.role === "primary")).toEqual([{ id: "english", role: "primary" }]);
    expect(setUnknownLanguage(d, true).languages).toEqual([]);
    expect(withLanguages(setUnknownLanguage(d, true), ["acholi"]).languageUnknown).toBe(false);
    // only what is picked: nothing else from the same group appears, and cultures stay untouched
    expect(withLanguages(empty, ["acholi"])).toEqual({ ...empty, languages: [{ id: "acholi", role: "primary" }] });
  });
  it("has one primary genre and ignores the order of picking when looking for changes", () => {
    let d = withGenres(empty, ["gospel", "reggae"]);
    d = setPrimaryGenre(d, "reggae");
    expect(d.genres).toEqual([{ id: "gospel", primary: false }, { id: "reggae", primary: true }]);
    expect(sameDraft({ ...empty, regions: ["a", "b"] }, { ...empty, regions: ["b", "a"] })).toBe(true);
    expect(sameDraft(empty, d)).toBe(false);
  });
  it("counts enriched tracks and offers switched-off terms only when already chosen", () => {
    expect(completion([{ status: "not_started" }, { status: "in_progress" }, { status: "verified" }])).toEqual({ enriched: 2, verified: 1, total: 3 });
    const terms = [{ id: "a", label: "A", active: true }, { id: "b", label: "B", active: false }];
    expect(offered(terms, []).map((t) => t.id)).toEqual(["a"]);
    expect(offered(terms, ["b"]).map((t) => t.id)).toEqual(["a", "b"]);
    expect(termLabel(terms, "b")).toBe("B (inactive)");
  });
});

const ORIGIN = "http://localhost:3100";
let mock: Mock;
beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "metadata-secret-metadata-secret-metadata";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});

describe("metadata through the site", () => {
  it("saves many values, reads them back, keeps provenance and refuses bad or stale saves", async () => {
    const login = await handleLogin(new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }) }));
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const csrf = ((await login.json()) as any).csrf as string;
    const call = async (path: string, method = "GET", body?: unknown, withCsrf = true) => {
      const [route, query] = path.split("?");
      const res = await handleAdminProxy(new Request(`${ORIGIN}/api/admin/${route}${query ? `?${query}` : ""}`, { method, headers: { origin: ORIGIN, cookie, "content-type": "application/json", ...(withCsrf ? { "x-csrf-token": csrf } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), route!.split("/"));
      const text = await res.text();
      return { status: res.status, json: (text ? JSON.parse(text) : undefined) as any };
    };
    const release = (await call("releases?type=album&limit=100")).json.releases.find((r: any) => r.trackCount > 1);
    const list = (await call(`releases/${release.id}/track-metadata`)).json;
    const first = list.tracks[0] as TrackMetadata;
    const draft: Draft = {
      ...toDraft(first),
      languages: [{ id: "luganda", role: "primary" }, { id: "english", role: "secondary" }],
      cultures: ["baganda", "acholi"], regions: ["central", "northern"],
      genres: [...toDraft(first).genres, { id: "kadongo_kamu", primary: false }],
      attributes: { mood: ["happy"], energy: ["energy_high"], danceability: [], instrumentation: ["guitar", "brass"] },
    };
    const url = `tracks/${first.trackId}/metadata`;
    expect((await call(url, "PUT", payload(draft, first.version), false)).status).toBe(403);
    expect((await call(url, "PUT", payload({ ...draft, languages: draft.languages.map((l) => ({ ...l, role: "primary" as const })) }, first.version))).status).toBe(422);
    expect((await call(url, "PUT", payload({ ...draft, cultures: ["martians"] }, first.version))).json.error.code).toBe("invalid_taxonomy");
    const saved = await call(url, "PUT", payload(draft, first.version));
    expect(saved.status).toBe(200);
    const read = (await call(url)).json as TrackMetadata;
    expect(sameDraft(toDraft(read), draft)).toBe(true);
    expect(read.status).toBe("pending_review");
    expect(read.languages[0]).toMatchObject({ source: "admin", verification: "pending" });
    expect(read.genres.filter((g) => g.source === "imported")).toHaveLength(first.genres.length); // what was kept keeps its source
    expect((await call(url, "PUT", payload(draft, first.version))).json.error.code).toBe("stale_version");
    // the other tracks are untouched
    const after = (await call(`releases/${release.id}/track-metadata`)).json;
    expect(completion(after.tracks).enriched).toBe(1);
  });
});
