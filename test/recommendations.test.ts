/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// The recommendation reports: how they are worded, and that they pass through the site to administrators only.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { blockDescription, blockedMessage, coverage, gaps, isArtist, notAvailable, reasonLabel, scoreParts, shareOfListened, shownPercent, type Readiness } from "@/lib/recommendations";
import { handleAdminProxy, handleLogin } from "@/server/handlers";

const songs = (over: Partial<Readiness["songs"]> = {}): Readiness["songs"] => ({
  playable: 872, withGenre: 602, withVerifiedLanguage: 1, withVerifiedRegion: 1, withVerifiedCulture: 1, withVerifiedSound: 1, ...over,
});

describe("recommendation reports", () => {
  it("never rounds a little coverage to nothing, or nearly all to everything", () => {
    expect(coverage(songs()).map(shownPercent)).toEqual(["69%", "under 1%", "under 1%", "under 1%", "under 1%"]);
    expect(shownPercent({ count: 871, total: 872 })).toBe("99%");
    expect(shownPercent({ count: 872, total: 872 })).toBe("100%");
    expect(shownPercent({ count: 0, total: 0 })).toBe("0%");
  });

  it("says what the gaps mean, only while they matter", () => {
    expect(gaps(songs())).toEqual([
      "Listeners' language choices can only affect 1 of 872 songs.",
      "Their region choices can only affect 1 of 872 songs.",
      "270 songs have no genre: a mix from one stays with the same artist, or songs sharing verified details.",
    ]);
    expect(gaps(songs({ withGenre: 872, withVerifiedLanguage: 600, withVerifiedRegion: 600 }))).toEqual([]);
    expect(gaps(songs({ playable: 0 }))).toEqual(["There are no playable songs to suggest."]);
  });

  it("shows counts rather than percentages while there are few listens", () => {
    expect(shareOfListened(0, 0)).toBe("–");
    expect(shareOfListened(5, 9)).toBe("5 of 9");
    expect(shareOfListened(36, 48)).toBe("75% (36)");
  });

  it("says what blocking does, and never offers to block a stand-in artist", () => {
    expect(blockDescription("artist")).toContain("including ones added later");
    expect(blockDescription("track")).toContain("songs listeners added themselves stay");
    expect(blockedMessage(0)).toBe("Blocked from suggestions");
    expect(blockedMessage(2)).toContain("2 places");
    expect([isArtist("art_1"), isArtist("none:trk_1"), isArtist("")]).toEqual([true, false, false]);
  });

  it("words reasons and score parts, also ones it does not know", () => {
    expect(reasonLabel("preferred_language")).toBe("Preferred language");
    expect(reasonLabel("brand_new_reason")).toBe("Brand new reason");
    expect(scoreParts({ discovery_rank: 0.5, zzz: 1, genre: 0.2, artist: 0.1 }).map((p) => p.id)).toEqual(["artist", "genre", "discovery_rank", "zzz"]);
    expect(notAvailable({ code: "not_available", status: 404 })).toBe(true);
    expect(notAvailable({ code: "not_found", status: 404 })).toBe(false);
    expect(notAvailable(undefined)).toBe(false);
  });
});

describe("recommendation routes through the site", () => {
  const ORIGIN = "http://localhost:3100";
  let mock: Mock;
  let cookie = "";
  beforeAll(async () => {
    mock = createMock({ accessTtl: 900 });
    const port = await mock.listen(0);
    process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
    process.env.SESSION_SECRET = "integration-secret-integration-secret-12";
    process.env.SITE_ORIGIN = ORIGIN;
    process.env.TRUST_PROXY = "false";
  });
  afterAll(async () => {
    await mock.close();
  });
  const get = async (path: string, withCookie = true) => {
    const url = new URL(`${ORIGIN}/api/admin/${path}`);
    const res = await handleAdminProxy(new Request(url, { headers: withCookie ? { cookie } : {} }), url.pathname.replace("/api/admin/", "").split("/"));
    return { status: res.status, json: (await res.json()) as any };
  };

  it("needs a signed-in administrator, and keeps the query", async () => {
    expect((await get("recommendations/readiness", false)).status).toBe(401);
    const login = await handleLogin(
      new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }) }),
    );
    cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const login2 = (await login.json()) as { csrf: string };
    const ready = await get("recommendations/readiness");
    expect(ready.status).toBe(200);
    expect(ready.json.songs.playable).toBeGreaterThan(0);
    expect((await get("recommendations/outcomes?days=7")).json).toEqual({ days: 7, rows: [] });
    expect((await get("recommendations/outcomes?days=30")).json.rows.length).toBeGreaterThan(0);
    const sound = await get("users/usr_listener/recommendations?surface=your_sound");
    expect(sound.status).toBe(200);
    expect(sound.json.items[0].reasons.length).toBeGreaterThan(0);
    expect((await get("users/usr_listener/recommendations?surface=mix")).status).toBe(422);
    expect((await get("users/nobody/recommendations")).status).toBe(404);

    // block, see it listed and gone from suggestions, then undo
    const csrf = login2.csrf;
    const send = async (method: string, path: string, body?: unknown) => {
      const url = new URL(`${ORIGIN}/api/admin/${path}`);
      const res = await handleAdminProxy(
        new Request(url, { method, headers: { cookie, "x-csrf-token": csrf, origin: ORIGIN, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }),
        url.pathname.replace("/api/admin/", "").split("/"),
      );
      const text = await res.text();
      return { status: res.status, json: text ? (JSON.parse(text) as any) : undefined };
    };
    const first = sound.json.items[0].trackId as string;
    expect((await send("POST", "recommendations/blocks", { trackId: first, reason: "x" })).status).toBe(422);
    const made = await send("POST", "recommendations/blocks", { trackId: first, reason: "wrong genre" });
    expect(made.status).toBe(201);
    expect((await send("POST", "recommendations/blocks", { trackId: first, reason: "wrong genre" })).json.error.code).toBe("already_blocked");
    expect((await get("recommendations/blocks")).json.blocks[0]).toMatchObject({ targetId: first, kind: "track", reason: "wrong genre" });
    expect((await get("users/usr_listener/recommendations")).json.items.map((i: any) => i.trackId)).not.toContain(first);
    expect((await send("DELETE", `recommendations/blocks/${made.json.id}`)).status).toBe(204);
    expect((await get("recommendations/blocks")).json.blocks).toEqual([]);
  });
});
