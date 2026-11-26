/* eslint-disable @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON */
// The Server page (storage and load): its display rules, and the real handlers against the mock.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD, type Mock } from "../mock/mock";
import { alertLevel, axisTop, countTop, fmtShare, fmtSpan, historyWindow, loadPercent, series, sortAlerts, splitAtGaps, storageParts } from "@/lib/system";
import type { ServerHistoryPoint, ServerInfo } from "@/lib/types";
import { handleAdminProxy, handleLogin } from "@/server/handlers";

const GB = 1024 ** 3;
const point = (at: string, load = 1): ServerHistoryPoint => ({ at, load, memoryUsedPercent: 20, diskUsedBytes: GB, diskFreeBytes: 9 * GB, uploadsWaiting: 0 });

describe("server page rules", () => {
  it("takes severity from the server's alerts, worst first, and keeps no thresholds of its own", () => {
    const alerts: ServerInfo["alerts"] = [
      { level: "warning", code: "load_high", message: "busy" },
      { level: "critical", code: "worker_silent", message: "silent" },
      { level: "warning", code: "something_new", message: "unknown codes still show" },
    ];
    expect(alertLevel(alerts, "disk_low")).toBeUndefined();
    expect(alertLevel(alerts, "load_high")).toBe("warning");
    expect(alertLevel(alerts, "queue_slow", "worker_silent")).toBe("critical");
    expect(sortAlerts(alerts).map((a) => a.code)).toEqual(["worker_silent", "load_high", "something_new"]);
  });

  it("leaves out storage that has not been counted instead of showing it as zero", () => {
    const uncounted: ServerInfo["storage"] = { measuredAt: null, objects: null, objectBytes: null, byKind: null, databaseBytes: 1000, otherBytes: null };
    expect(storageParts(uncounted).map((p) => p.key)).toEqual(["database"]);
    const kind = { objects: 2, bytes: 10 };
    const counted: ServerInfo["storage"] = { ...uncounted, measuredAt: "2026-11-26T00:00:00Z", byKind: { audioOriginals: kind, audioPlayback: kind, images: kind, other: kind }, otherBytes: 5 };
    expect(storageParts(counted).map((p) => p.key)).toEqual(["audioOriginals", "audioPlayback", "images", "database", "other", "rest"]);
  });

  it("breaks a history line where readings are missing, tolerating one late reading", () => {
    const pts = ["07:00", "07:05", "07:15", "08:00", "08:05", "09:00"].map((t) => point(`2026-11-26T${t}:00Z`));
    const runs = splitAtGaps(series(pts, "load"), 300);
    expect(runs.map((r) => r.length)).toEqual([3, 2, 1]);
    expect(splitAtGaps([], 300)).toEqual([]);
  });

  it("ends the time window at the server's clock, so a stopped worker shows as empty time", () => {
    const w = historyWindow(24, 300, [point("2026-11-26T01:00:00Z")], "2026-11-26T09:00:00Z");
    expect(w.end).toBe(Date.parse("2026-11-26T09:00:00Z"));
    expect(w.end - w.start).toBe(24 * 3_600_000);
    // a reading newer than the (older) current picture still fits
    expect(historyWindow(1, 300, [point("2026-11-26T09:05:00Z")], "2026-11-26T09:00:00Z").end).toBe(Date.parse("2026-11-26T09:10:00Z"));
  });

  it("formats shares, spans, load and axis tops", () => {
    expect(fmtShare(1, 100_000)).toBe("under 0.1%");
    expect(fmtShare(0, 100)).toBe("0%");
    expect(fmtShare(25, 1000)).toBe("2.5%");
    expect(fmtShare(990, 1000)).toBe("99%");
    expect(fmtSpan(45)).toBe("45 s");
    expect(fmtSpan(340)).toBe("5 min");
    expect(fmtSpan(8700)).toBe("2 h 25 min");
    expect(fmtSpan(12 * 86_400 + 5 * 3600)).toBe("12 days 5 h");
    expect(loadPercent(1.47, 10)).toBe(15);
    expect(loadPercent(5, 2)).toBe(250);
    expect(axisTop(0)).toBe(1);
    expect(axisTop(2.52)).toBe(4);
    expect(axisTop(14 * GB, true)).toBe(20 * GB);
    expect(axisTop(939 * GB, true)).toBe(1000 * GB);
    expect([0, 1, 5, 7, 37].map(countTop)).toEqual([2, 2, 6, 8, 40]); // the middle gridline stays whole
  });
});

const ORIGIN = "http://localhost:3100";
let mock: Mock;
beforeAll(async () => {
  mock = createMock();
  const port = await mock.listen(0);
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.SESSION_SECRET = "server-secret-server-secret-server-12";
  process.env.SITE_ORIGIN = ORIGIN;
  process.env.TRUST_PROXY = "false";
});
afterAll(async () => {
  await mock.close();
});

describe("server metrics through the site", () => {
  const get = async (path: string, query: string, cookie = "") => {
    const res = await handleAdminProxy(new Request(`${ORIGIN}/api/admin/${path}${query}`, { headers: cookie ? { cookie } : {} }), path.split("/"));
    return { status: res.status, json: (await res.json()) as any };
  };

  it("needs a signed-in administrator", async () => {
    expect((await get("system", "")).status).toBe(401);
    expect((await get("system/history", "?hours=24")).status).toBe(401);
  });

  it("returns the current picture and the history, and refuses a bad range", async () => {
    const res = await handleLogin(
      new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email: MOCK_ADMIN_EMAIL, password: MOCK_ADMIN_PASSWORD }) }),
    );
    const cookie = res.headers.getSetCookie()[0]!.split(";")[0]!;
    const now = await get("system", "", cookie);
    expect(now.status).toBe(200);
    expect(now.json.server.disk.totalBytes).toBeGreaterThan(0);
    expect(now.json.alerts[0].code).toBe("disk_low");
    const week = await get("system/history", "?hours=168", cookie);
    expect(week.status).toBe(200);
    expect(week.json.hours).toBe(168);
    expect(week.json.points.length).toBeGreaterThan(100);
    expect(week.json.points.length).toBeLessThanOrEqual(300);
    expect(splitAtGaps(series(week.json.points, "load"), week.json.stepSeconds).length).toBe(2); // the mock's worker outage
    expect((await get("system/history", "?hours=1000", cookie)).status).toBe(422);
  });
});
