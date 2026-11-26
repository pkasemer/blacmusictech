import { describe, expect, it } from "vitest";
import type { UploadParts, UploadStart } from "@/lib/types";
import { acceptable, runUpload, slicePart, titleFromFilename, type UploadIO } from "@/lib/upload";

const MB = 1024 * 1024;
const file = (size: number, name = "song.mp3") => Object.assign(new Blob([new Uint8Array(size)]), { name });
const meta = { releaseId: "alb_1", title: "Song" };

/** A fake network that records what happens. */
function fake(opts: { type: "single" | "multipart"; partSize?: number; failPart?: { n: number; times: number }; missingOnce?: number[] }) {
  const log: string[] = [];
  const sent = new Map<number, number>();
  let fails = opts.failPart?.times ?? 0;
  let missing = opts.missingOnce ? [...opts.missingOnce] : [];
  const tokensFor = (nums: number[]) => nums.map((n) => ({ number: n, token: `t${n}` }));
  const io: UploadIO = {
    async create(_m, f) {
      log.push("create");
      const count = opts.type === "single" ? 1 : Math.ceil(f.size / opts.partSize!);
      const start: UploadStart = { id: "upl_1", status: "pending", plan: { type: opts.type, partSize: opts.partSize, partCount: count, parts: tokensFor(Array.from({ length: count }, (_, i) => i + 1)) } };
      return start;
    },
    async parts(_id, size) {
      log.push("parts");
      const count = Math.ceil(size / opts.partSize!);
      const todo = Array.from({ length: count }, (_, i) => i + 1).filter((n) => !sent.has(n));
      const r: UploadParts = { partSize: opts.partSize, partCount: todo.length, uploaded: [...sent.keys()], parts: tokensFor(todo) };
      return r;
    },
    async putPart(token, data, onBytes) {
      const n = Number(token.slice(1));
      if (opts.failPart && n === opts.failPart.n && fails > 0) {
        fails--;
        throw new Error("network blip");
      }
      onBytes(data.size / 2);
      onBytes(data.size);
      sent.set(n, data.size);
      log.push(`put${n}`);
    },
    async complete() {
      if (missing.length > 0) {
        for (const n of missing) sent.delete(n);
        missing = [];
        throw Object.assign(new Error("parts missing"), { code: "parts_missing" });
      }
      log.push("complete");
    },
  };
  return { io, log, sent };
}

describe("runUpload", () => {
  it("sends a small file as one part and completes it", async () => {
    const f = fake({ type: "single" });
    const id = await runUpload(file(3 * MB), meta, f.io, { backoffMs: 0 });
    expect(id).toBe("upl_1");
    expect(f.log).toEqual(["create", "put1", "complete"]);
    expect(f.sent.get(1)).toBe(3 * MB);
  });

  it("splits a big file into equal parts with a shorter last one, and reports progress up to 100%", async () => {
    const f = fake({ type: "multipart", partSize: 8 * MB });
    const progress: number[] = [];
    await runUpload(file(20 * MB), meta, f.io, { backoffMs: 0, onProgress: (p) => progress.push(p) });
    expect([...f.sent.entries()].sort()).toEqual([[1, 8 * MB], [2, 8 * MB], [3, 4 * MB]]);
    expect(f.log.at(-1)).toBe("complete");
    expect(Math.max(...progress)).toBeCloseTo(1, 5);
    expect(progress.every((p) => p >= 0 && p <= 1)).toBe(true);
  });

  it("retries a part that fails and, after a second failure, asks for fresh links", async () => {
    const f = fake({ type: "multipart", partSize: 8 * MB, failPart: { n: 2, times: 2 } });
    await runUpload(file(17 * MB), meta, f.io, { backoffMs: 0 });
    expect(f.sent.size).toBe(3);
    expect(f.log).toContain("parts");
    expect(f.log.at(-1)).toBe("complete");
  });

  it("gives up after the retries and reports the error", async () => {
    const f = fake({ type: "multipart", partSize: 8 * MB, failPart: { n: 1, times: 99 } });
    await expect(runUpload(file(17 * MB), meta, f.io, { backoffMs: 0, retries: 2 })).rejects.toThrow("network blip");
    expect(f.log).not.toContain("complete");
  });

  it("resends the parts the Backend says are missing, then completes", async () => {
    const f = fake({ type: "multipart", partSize: 8 * MB, missingOnce: [2] });
    await runUpload(file(17 * MB), meta, f.io, { backoffMs: 0 });
    expect(f.log.filter((l) => l === "put2")).toHaveLength(2);
    expect(f.log.at(-1)).toBe("complete");
  });

  it("stops when cancelled", async () => {
    const f = fake({ type: "multipart", partSize: 8 * MB });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(runUpload(file(17 * MB), meta, f.io, { backoffMs: 0, signal: ctrl.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(f.log).not.toContain("complete");
  });
});

describe("file helpers", () => {
  it("slices parts at the sizes the Backend expects", () => {
    const f = file(20 * MB);
    expect(slicePart(f, 8 * MB, 1, 3).size).toBe(8 * MB);
    expect(slicePart(f, 8 * MB, 3, 3).size).toBe(4 * MB);
    expect(slicePart(f, undefined, 1, 1)).toBe(f);
  });
  it("makes a clean title from a file name", () => {
    expect(titleFromFilename("01 - my_song (final).mp3")).toBe("my song (final)");
    expect(titleFromFilename("Track.WAV")).toBe("Track");
    expect(titleFromFilename("7.mp3")).toBe("7");
    expect(titleFromFilename("  02. Lagos Nights.flac")).toBe("Lagos Nights");
  });
  it("accepts audio and says why it refuses anything else", () => {
    expect(acceptable({ name: "a.mp3", type: "audio/mpeg", size: 10 })).toBeNull();
    expect(acceptable({ name: "a.flac", type: "", size: 10 })).toBeNull();
    expect(acceptable({ name: "a.pdf", type: "application/pdf", size: 10 })).toMatch(/not an audio/);
    expect(acceptable({ name: "a.mp3", type: "audio/mpeg", size: 0 })).toMatch(/empty/);
    expect(acceptable({ name: "a.mp3", type: "audio/mpeg", size: 3 * 1024 ** 3 })).toMatch(/2 GB/);
  });
});

describe("browser-side upload calls", () => {
  it("send every call to this site's /api routes with the right prefix", async () => {
    const { uploadIO, uploadStatus, cancelUpload } = await import("@/lib/upload-io");
    const calls: { url: string; method: string }[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      return new Response(init?.method === "DELETE" || url.endsWith("/complete") ? null : "{}", { status: init?.method === "DELETE" ? 204 : 200 });
    }) as typeof fetch;
    try {
      await uploadIO.complete("upl_1");
      await uploadStatus("upl_1");
      await cancelUpload("upl_1");
      await uploadIO.parts("upl_1", 1234);
    } finally {
      globalThis.fetch = real;
    }
    expect(calls).toEqual([
      { url: "/api/admin/uploads/upl_1/complete", method: "POST" },
      { url: "/api/admin/uploads/upl_1", method: "GET" },
      { url: "/api/admin/uploads/upl_1", method: "DELETE" },
      { url: "/api/uploads/upl_1/parts?size=1234", method: "GET" },
    ]);
  });
});
