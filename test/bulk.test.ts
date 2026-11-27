/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// Publishing several releases at once, and changing an artist's picture: the rules, and the real handlers against the mock.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { ApiError } from "@/lib/api";
import { runBulk, settled, summary, whyNotSelectable, type BulkItem, type BulkResult } from "@/lib/bulk";
import { handleAdminProxy, handleImageUpload, handleLogin } from "@/server/handlers";

const items: BulkItem[] = ["a", "b", "c", "d"].map((id) => ({ id, title: id.toUpperCase(), artistName: "X" }));

describe("bulk publish rules", () => {
  it("offers only releases that can be published", () => {
    const base = { visibility: "draft" as const, takenDown: false, trackCount: 1 };
    expect(whyNotSelectable(base)).toBeNull();
    expect(whyNotSelectable({ ...base, visibility: "scheduled" })).toBeNull();
    expect(whyNotSelectable({ ...base, visibility: "public" })).toBe("Already public");
    expect(whyNotSelectable({ ...base, takenDown: true })).toMatch(/Taken down/);
    expect(whyNotSelectable({ ...base, trackCount: 0 })).toBe("No tracks yet");
  });

  it("goes one at a time, carries on after a refusal, and unticks only what is settled", async () => {
    let running = 0;
    const order: string[] = [];
    const results = await runBulk(
      items,
      async (i) => {
        expect(++running).toBe(1);
        await Promise.resolve();
        order.push(i.id);
        running--;
        if (i.id === "b") throw new ApiError(409, "uploads_pending", "busy");
        if (i.id === "c") throw new ApiError(404, "not_found", "gone");
      },
      () => {},
    );
    expect(order).toEqual(["a", "b", "c", "d"]);
    expect(results.map((r) => r.outcome)).toEqual(["done", "failed", "failed", "done"]);
    expect(results[1]!.message).toMatch(/still uploading/);
    expect(settled(results)).toEqual(["a", "c", "d"]); // b stays ticked for another try
    expect(summary(results, false)).toBe("2 published, 2 failed");
  });

  it("stops asking once the server refuses requests, or when the person stops it", async () => {
    let calls = 0;
    const limited = await runBulk(items, async () => {
      if (++calls === 2) throw new ApiError(429, "rate_limited", "Too many requests.");
    }, () => {});
    expect(calls).toBe(2);
    expect(limited.map((r) => r.outcome)).toEqual(["done", "failed", "not_tried", "not_tried"]);

    const seen: BulkResult[] = [];
    const stopped = await runBulk(items, async () => {}, (r) => seen.push(r), () => seen.length >= 1);
    expect(stopped.map((r) => r.outcome)).toEqual(["done", "not_tried", "not_tried", "not_tried"]);
    expect(summary(stopped, true)).toBe("1 scheduled, 3 not tried");
  });
});

const ORIGIN = "http://localhost:3100";
let mock: Mock;
beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "bulk-secret-bulk-secret-bulk-secret-12";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});

describe("changing an artist's picture through the site", () => {
  const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

  it("works for a catalog artist, removes again, and is refused for an artist with an account", async () => {
    const login = await handleLogin(
      new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }) }),
    );
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const csrf = ((await login.json()) as any).csrf as string;
    const headers = { origin: ORIGIN, cookie, "x-csrf-token": csrf, "content-type": "application/json" };
    const admin = async (path: string, method = "GET", body?: unknown) => {
      const res = await handleAdminProxy(new Request(`${ORIGIN}/api/admin/${path.split("?")[0]}${path.includes("?") ? "?" + path.split("?")[1] : ""}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), path.split("?")[0]!.split("/"));
      const text = await res.text();
      return { status: res.status, json: (text ? JSON.parse(text) : undefined) as any };
    };
    const upload = await handleImageUpload(new Request(`${ORIGIN}/api/images?purpose=avatar`, { method: "POST", headers: { ...headers, "content-type": "image/png" }, body: PNG }));
    const image = (await upload.json()) as { id: string };

    const made = await admin("artists", "POST", { name: "Picture Check" });
    const set = await admin(`artists/${made.json.id}`, "PATCH", { imageId: image.id });
    expect(set.status).toBe(200);
    expect((await admin(`artists/${made.json.id}`)).json.imageUrl).toContain(image.id);
    expect((await admin(`artists/${made.json.id}`, "PATCH", { imageId: "" })).status).toBe(200);
    expect((await admin(`artists/${made.json.id}`)).json.imageUrl).toBeUndefined();

    const owned = (await admin("artists?limit=100")).json.artists.find((a: any) => a.ownerUserId);
    const refused = await admin(`artists/${owned.id}`, "PATCH", { imageId: image.id });
    expect(refused.status).toBe(422);
    expect(refused.json.error.code).toBe("owned_artist");
  });
});
