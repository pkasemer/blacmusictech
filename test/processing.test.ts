/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// Stuck songs: how they are worded, and listing and retrying them through the site.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { describe as stands, retryError, type ProcessingUpload } from "@/lib/processing";
import { handleAdminProxy, handleLogin } from "@/server/handlers";

const base: ProcessingUpload = {
  uploadId: "up", title: "Song", artistId: "art", artistName: "A", releaseId: "rel", releaseTitle: "R", status: "processing", state: "stuck", attempts: 1, sizeBytes: 1,
  createdAt: "2026-11-26T09:00:00Z", updatedAt: "2026-11-26T09:58:00Z", startedAt: "2026-11-26T09:40:00Z", lastSignalAt: "2026-11-26T09:48:00Z",
  waitingOnTransfer: false, import: null, error: "", canRetry: true, canForce: false,
};
const NOW = "2026-11-26T10:00:00Z";

describe("stuck song wording", () => {
  it("measures by the server's clock and says why a song is not moving", () => {
    expect(stands(base, NOW)).toBe("No sign of work for 12 min");
    expect(stands({ ...base, state: "working" }, NOW)).toBe("Started 20 min ago");
    expect(stands({ ...base, state: "waiting", status: "queued" }, NOW)).toBe("In the queue for 2 min");
    expect(stands({ ...base, state: "waiting", waitingOnTransfer: true }, NOW)).toMatch(/song transfer/);
    expect(stands({ ...base, state: "failed", error: "the file has no audio" }, NOW)).toBe("the file has no audio");
    expect(stands({ ...base, lastSignalAt: null, startedAt: null }, NOW)).toBe("No sign of work");
  });
  it("explains each refusal", () => {
    expect(retryError("file_gone", "x")).toMatch(/Upload the song again/);
    expect(retryError("still_processing", "x")).toMatch(/refreshed/);
    expect(retryError("not_available", "x")).toMatch(/latest Backend update/);
    expect(retryError("other", "kept")).toBe("kept");
  });
});

const ORIGIN = "http://localhost:3100";
let mock: Mock;
beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "stuck-secret-stuck-secret-stuck-secret-12";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});

describe("retrying through the site", () => {
  it("retries a stuck song once, needs force for a working one, and refuses what cannot be retried", async () => {
    const login = await handleLogin(
      new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }) }),
    );
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const csrf = ((await login.json()) as any).csrf as string;
    const call = async (path: string, method = "GET", body?: unknown, withCsrf = true) => {
      const headers: Record<string, string> = { origin: ORIGIN, cookie, "content-type": "application/json", ...(withCsrf ? { "x-csrf-token": csrf } : {}) };
      const res = await handleAdminProxy(new Request(`${ORIGIN}/api/admin/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), path.split("/"));
      const text = await res.text();
      return { status: res.status, json: (text ? JSON.parse(text) : undefined) as any };
    };
    const retry = (id: string, body: unknown = {}) => call(`processing/${id}/retry`, "POST", body);

    const list = (await call("processing")).json;
    expect(list.counts).toEqual({ stuck: 1, working: 1, waiting: 2, failed: 2 });
    expect(list.uploads.map((u: any) => u.state)).toEqual(["stuck", "working", "waiting", "waiting", "failed", "failed"]);
    expect((await call("system")).json.alerts.map((a: any) => a.code)).toContain("upload_stuck");

    expect((await call("processing/up_stuck/retry", "POST", {}, false)).status).toBe(403); // no CSRF token
    const done = await retry("up_stuck");
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({ state: "waiting", attempts: 0 });
    expect((await retry("up_stuck")).json.error.code).toBe("already_queued"); // a second click
    expect((await retry("up_working")).json.error.code).toBe("still_processing");
    expect((await retry("up_working", { force: true })).status).toBe(200);
    expect((await retry("up_failed_gone")).json.error.code).toBe("file_gone");
    expect((await retry("up_failed_kept")).status).toBe(200);
    expect((await retry("up_nothing")).status).toBe(404);
    expect((await call("system")).json.alerts.map((a: any) => a.code)).not.toContain("upload_stuck");
  });
});
