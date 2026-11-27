/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// Review and verification: submit, verify, reject, release progress and the review queues, through the site.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { itemKey, reviewItems, supportsReview, toDraft, payload, type Taxonomy, type TrackMetadata } from "@/lib/metadata";
import { handleAdminProxy, handleLogin } from "@/server/handlers";

const ORIGIN = "http://localhost:3100";
let mock: Mock;
beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "review-secret-review-secret-review-12345";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});

describe("review through the site", () => {
  it("moves a track from started to waiting, verified and back, and keeps the queues and release progress in step", async () => {
    const login = await handleLogin(new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }) }));
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const csrf = ((await login.json()) as any).csrf as string;
    const call = async (path: string, method = "GET", body?: unknown) => {
      const [route, query] = path.split("?");
      const res = await handleAdminProxy(new Request(`${ORIGIN}/api/admin/${route}${query ? `?${query}` : ""}`, { method, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), route!.split("/"));
      const text = await res.text();
      return { status: res.status, json: (text ? JSON.parse(text) : undefined) as any };
    };
    const tax = (await call("taxonomy")).json as Taxonomy;
    const release = (await call("releases?type=album&limit=100")).json.releases.find((r: any) => r.trackCount > 1);
    let track = (await call(`releases/${release.id}/track-metadata`)).json.tracks[0] as TrackMetadata;
    expect(supportsReview(track)).toBe(true);
    const act = async (what: "submit" | "review", body: Record<string, unknown> = {}) => {
      const r = await call(`tracks/${track.trackId}/metadata/${what}`, "POST", { version: track.version, ...body });
      if (r.status === 200) track = r.json;
      return r;
    };

    expect((await act("submit")).json.error.code).toBe("missing_required");
    track = (await call(`tracks/${track.trackId}/metadata`, "PUT", payload({ ...toDraft(track), languages: [{ id: "luganda", role: "primary" }], regions: ["central"] }, track.version))).json;
    // saved with what is required, it waits for review without being submitted
    expect(track.status).toBe("pending_review");
    expect((await call("releases?pendingReview=true&limit=100")).json.releases.map((r: any) => r.id)).toContain(release.id);
    const waiting = (await call("metadata/tracks?queue=pending_review&limit=100")).json;
    expect(waiting.tracks.map((t: any) => t.trackId)).toContain(track.trackId);
    expect(waiting.counts.culture_region_review).toBeGreaterThanOrEqual(1);

    const values = reviewItems(track, tax);
    const language = values.find((i) => i.category === "languages")!;
    expect(new Set(values.map(itemKey)).size).toBe(values.length);
    expect((await act("review", { decision: "reject", items: [{ category: "languages", id: "luganda" }] })).status).toBe(422); // a rejection needs a reason
    await act("review", { decision: "verify", items: [{ category: language.category, id: language.id }] });
    expect(track.status).toBe("verified");
    expect(track.regions[0]!.verification).toBe("pending"); // only what was chosen changed
    await act("review", { decision: "reject", items: [{ category: "languages", id: "luganda" }], note: "It is sung in Lusoga" });
    expect(track.status).toBe("in_progress");
    expect(track.reviewNote).toBe("It is sung in Lusoga");
    expect((await call("metadata/tracks?queue=no_language&limit=100")).json.tracks.map((t: any) => t.trackId)).toContain(track.trackId);

    // "Unknown" is a classification of its own and can be verified
    track = (await call(`tracks/${track.trackId}/metadata`, "PUT", payload({ ...toDraft(track), languageUnknown: true, languages: [] }, track.version))).json;
    expect(reviewItems(track, tax)[0]).toMatchObject({ category: "languageUnknown", id: "" });
    await act("review", { decision: "verify", items: [{ category: "languageUnknown", id: "" }] });
    expect(track.status).toBe("verified");
    const progress = (await call("releases?limit=100")).json.releases.find((r: any) => r.id === release.id).metadata;
    expect(progress).toMatchObject({ verified: 1, status: "in_progress" });
  });
});
