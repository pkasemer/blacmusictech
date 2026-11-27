/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// The import queue: what is converting, what comes next and in which order, as the Backend runs it.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { buildQueue, finishedCount, finishedSource, matchesFinished, mergeLists, orderTracks, roughly, startedInOrder } from "@/lib/importQueue";
import type { ImportJob, ImportTrackStatus, JobStatus } from "@/lib/imports";
import { handleAdminProxy, handleLogin } from "@/server/handlers";

function job(jobId: string, status: JobStatus, startedAt: string | null, tracks: ImportTrackStatus[] = [], createdAt = "2026-11-26T08:00:00Z"): ImportJob {
  const n = (s: ImportTrackStatus) => tracks.filter((t) => t === s).length;
  return {
    jobId, status, artist: `Artist ${jobId}`, type: "single", visibility: "draft", totalTracks: tracks.length, created: n("created"), skippedDuplicate: n("skippedDuplicate"),
    failed: n("failed"), remaining: n("waiting") + n("processing"), bytesStored: 0, createdAt, startedAt, finishedAt: status === "completed" ? createdAt : null,
    results: tracks.map((s, i) => ({ title: `${jobId}-${i + 1}`, status: s })),
  };
}
const listed = (j: ImportJob): ImportJob => ({ ...j, results: undefined });

describe("the import queue", () => {
  // created in the opposite order to the one they started in: the start time decides
  const first = job("a", "processing", "2026-11-26T09:00:00Z", ["created", "processing", "waiting"], "2026-11-26T08:30:00Z");
  const second = job("b", "processing", "2026-11-26T09:05:00Z", ["processing", "waiting", "waiting"], "2026-11-26T08:20:00Z");
  const third = job("c", "processing", "2026-11-26T09:10:00Z", ["waiting", "waiting"], "2026-11-26T08:10:00Z");
  const files = job("d", "pending", null, ["waiting"]);
  const done = job("e", "completed", "2026-11-26T07:00:00Z", ["created"]);
  const all = [done, third, files, second, first];
  const details = new Map([first, second, third].map((j) => [j.jobId, j]));

  it("serves started jobs by start time, and tells converting from waiting", () => {
    expect(startedInOrder(all).map((j) => j.jobId)).toEqual(["a", "b", "c"]);
    const q = buildQueue(all.map(listed), details);
    expect(q.now.map((s) => s.title)).toEqual(["a-2", "b-1"]);
    expect(q.running.map((r) => r.job.jobId)).toEqual(["a", "b"]);
    expect(q.queued.map((e) => [e.job.jobId, e.place, e.startsIn])).toEqual([["c", 1, 5 * 42]]);
    expect(q.upNext.map((s) => s.title)).toEqual(["a-3", "b-2", "b-3", "c-1", "c-2"]);
    expect(q.songsWaiting).toBe(5);
    expect(q.awaitingFiles.map((j) => j.jobId)).toEqual(["d"]);
    expect(q.finished.map((j) => j.jobId)).toEqual(["e"]);
  });

  it("never names a next song past a job whose songs it has not read", () => {
    const q = buildQueue(all.map(listed), new Map([["a", first], ["c", third]]));
    expect(q.upNext.map((s) => s.title)).toEqual(["a-3"]);
    expect(q.queued.map((e) => e.job.jobId)).toEqual(["b", "c"]);
  });

  it("merges the unfinished list, and notices a server that ignores the query", () => {
    const latest = { imports: Array.from({ length: 20 }, (_, i) => listed(job(`n${i}`, "processing", "2026-11-26T09:00:00Z", ["waiting"], `2026-11-26T08:${String(10 + i)}:00Z`))) };
    const older = listed(job("older", "processing", "2026-11-26T06:00:00Z", ["waiting"], "2026-11-26T06:00:00Z"));
    const good = mergeLists(latest, { imports: [...latest.imports, older] });
    expect(good.incomplete).toBe(false);
    expect(good.jobs).toHaveLength(21);
    const ignored = { imports: [listed(done), ...latest.imports.slice(1)] };
    expect(mergeLists(latest, ignored).incomplete).toBe(true);
    expect(mergeLists({ imports: [listed(first), listed(done)] }, { imports: [listed(first), listed(done)] }).incomplete).toBe(false); // fewer than 20: nothing is hidden
  });

  it("never shows 0 finished just because the 20 newest imports are unfinished", () => {
    const waiting = { imports: Array.from({ length: 20 }, (_, i) => listed(job(`w${i}`, "pending", null, ["waiting"]))) };
    const refused = finishedSource(waiting, undefined, { status: 400, code: "bad_request" }); // today's server
    expect(refused).toMatchObject({ kind: "recent", complete: false });
    expect(finishedCount(refused)).toBe("–");
    const ignored = finishedSource(waiting, waiting); // a server that ignores the query
    expect([ignored.kind, finishedCount(ignored)]).toEqual(["recent", "–"]);
    expect(finishedCount(finishedSource(waiting, undefined, { status: 502, code: "bad_gateway" }))).toBe("–");
    expect(finishedCount(finishedSource(waiting, undefined))).toBe("…");
    const served = finishedSource(waiting, { imports: [listed(done)], total: 19 });
    expect([served.kind, finishedCount(served)]).toEqual(["server", "19"]);
    // an older server with fewer than 20 imports in all has listed every one: a real 0
    expect(finishedCount(finishedSource({ imports: waiting.imports.slice(0, 3) }, undefined, { status: 400, code: "bad_request" }))).toBe("0");
    expect(finishedCount(finishedSource({ imports: [listed(done), ...waiting.imports.slice(1)] }, undefined, { status: 400, code: "bad_request" }))).toBe("1+");
  });

  it("sorts a long track list by what happens next, keeping the script's numbers, and filters finished runs", () => {
    const rows = orderTracks(job("x", "processing", null, ["created", "waiting", "failed", "processing", "skippedDuplicate", "waiting"]).results!);
    expect(rows.map((r) => r.number)).toEqual([4, 2, 6, 3, 1, 5]);
    const bad = job("f", "completed_with_errors", null, ["created", "failed"]);
    expect([done, bad].filter((j) => matchesFinished(j, "problems")).map((j) => j.jobId)).toEqual(["f"]);
    expect([done, bad].filter((j) => matchesFinished(j, "completed")).map((j) => j.jobId)).toEqual(["e"]);
    expect([roughly(20), roughly(210), roughly(3600), roughly(5400)]).toEqual(["under a minute", "about 4 min", "about 1 h", "about 1 h 30 min"]);
  });
});

const ORIGIN = "http://localhost:3100";
let mock: Mock;
beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "queue-secret-queue-secret-queue-secret-12";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});

describe("the queue through the site", () => {
  it("passes the unfinished query on and builds the order from the job answers", async () => {
    const login = await handleLogin(
      new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }) }),
    );
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const get = async (path: string, query = "") => (await (await handleAdminProxy(new Request(`${ORIGIN}/api/admin/${path}${query}`, { headers: { cookie } }), path.split("/"))).json()) as any;
    const latest = await get("imports");
    const unfinished = await get("imports", "?state=unfinished");
    expect(unfinished.imports.every((j: any) => j.status === "pending" || j.status === "processing")).toBe(true);
    const { jobs, incomplete } = mergeLists(latest, unfinished);
    expect(incomplete).toBe(false);
    const details = new Map<string, ImportJob>();
    for (const j of startedInOrder(jobs)) details.set(j.jobId, await get(`imports/${j.jobId}`));
    const q = buildQueue(jobs, details);
    expect(q.now).toHaveLength(2);
    expect(q.queued.map((e) => e.job.artist)).toEqual(["Amara", "Obi"]);
    expect(q.upNext.length).toBe(8);
    expect(q.awaitingFiles.map((j) => j.jobId)).toContain("imp_waiting");
    const first = await get("imports", "?state=finished&limit=1&offset=0");
    const second = await get("imports", "?state=finished&limit=1&offset=1");
    expect(first.total).toBeGreaterThanOrEqual(2);
    expect(first.imports[0].jobId).not.toBe(second.imports[0].jobId);
    expect(finishedSource(latest, first).kind).toBe("server");
  });
});
