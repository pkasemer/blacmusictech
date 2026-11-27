/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// Bulk changes: preview first, only the ticked categories, nothing unrelated overwritten.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { buildChanges, emptyForm, versionsOf } from "@/lib/bulkMetadata";
import { payload, toDraft, type TrackMetadata } from "@/lib/metadata";
import { handleAdminProxy, handleLogin } from "@/server/handlers";

describe("what a bulk form sends", () => {
  it("sends only ticked categories, and nothing until each has a value", () => {
    const f = emptyForm();
    expect(buildChanges(f)).toBeNull();
    f.regions = { on: false, mode: "replace", ids: ["central"] }; // chosen but not ticked
    f.languages = { on: true, mode: "add", ids: [], primary: "" };
    expect(buildChanges(f)).toBeNull();
    f.languages = { on: true, mode: "add", ids: ["luganda", "english"], primary: "english" };
    expect(buildChanges(f)).toEqual({ languages: { mode: "add", values: [{ id: "luganda", role: "secondary" }, { id: "english", role: "primary" }] } });
  });
});

const ORIGIN = "http://localhost:3100";
let mock: Mock;
beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "bulkmeta-secret-bulkmeta-secret-123456";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});

describe("bulk changes through the site", () => {
  it("previews without changing, then changes only the chosen category of the chosen tracks", async () => {
    const login = await handleLogin(new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }) }));
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const csrf = ((await login.json()) as any).csrf as string;
    const call = async (path: string, method = "GET", body?: unknown) => {
      const [route, query] = path.split("?");
      const res = await handleAdminProxy(new Request(`${ORIGIN}/api/admin/${route}${query ? `?${query}` : ""}`, { method, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), route!.split("/"));
      const text = await res.text();
      return { status: res.status, json: (text ? JSON.parse(text) : undefined) as any };
    };
    const release = (await call("releases?type=album&limit=100")).json.releases.find((r: any) => r.trackCount > 2);
    const read = async () => (await call(`releases/${release.id}/track-metadata`)).json.tracks as TrackMetadata[];
    let [a, b, c] = await read();
    await call(`tracks/${a!.trackId}/metadata`, "PUT", payload({ ...toDraft(a!), languages: [{ id: "acholi", role: "primary" }], cultures: ["acholi"], regions: ["northern"] }, a!.version));
    await call(`tracks/${b!.trackId}/metadata`, "PUT", payload({ ...toDraft(b!), languageUnknown: true, languages: [] }, b!.version));
    [a, b, c] = await read();
    const ids = [a!.trackId, b!.trackId];
    const body = { trackIds: ids, changes: { languages: { mode: "add", values: [{ id: "english", role: "primary" }] } } };

    const preview = (await call("metadata/bulk", "POST", { ...body, dryRun: true })).json;
    expect(preview).toMatchObject({ changed: 1, skipped: 1 });
    expect(preview.results[1].reason).toBe("language_unknown");
    expect(await read()).toEqual([a, b, c, ...(await read()).slice(3)]); // a preview changes nothing

    expect((await call("metadata/bulk", "POST", { ...body, dryRun: false, versions: { [a!.trackId]: "old", [b!.trackId]: b!.version } })).json.error.code).toBe("stale_version");
    expect((await call("metadata/bulk", "POST", { ...body, dryRun: false, versions: versionsOf(preview) })).status).toBe(200);
    const [a2, b2, c2] = await read();
    expect(a2!.languages.map((l) => [l.id, l.role])).toEqual([["acholi", "primary"], ["english", "secondary"]]); // the existing primary stays
    expect([a2!.cultures, a2!.regions, a2!.genres]).toEqual([a!.cultures, a!.regions, a!.genres]); // untouched
    expect(b2).toEqual(b);
    expect(c2).toEqual(c); // not selected

    const check = (await call("metadata/bulk-verify", "POST", { trackIds: ids, categories: ["languages"], dryRun: true })).json;
    expect(check.changed).toBe(2);
    await call("metadata/bulk-verify", "POST", { trackIds: ids, categories: ["languages"], dryRun: false, versions: versionsOf(check) });
    const [a3] = await read();
    expect(a3!.languages.every((l) => l.verification === "verified")).toBe(true);
    expect(a3!.regions[0]!.verification).toBe("pending");
  });
});
