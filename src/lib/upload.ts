// Uploading one audio file: split it into parts, send a few at a time with retries, resume what is missing, then
// tell the Backend it is complete. The network calls are passed in (see upload-io.ts), so the logic can be tested.

import type { UploadParts, UploadStart } from "./types";

export interface UploadMeta {
  releaseId: string;
  title: string;
  genre?: string;
  trackNumber?: number;
  explicit?: boolean;
}

export interface UploadIO {
  create(meta: UploadMeta, file: { name: string; size: number }): Promise<UploadStart>;
  parts(id: string, size: number): Promise<UploadParts>;
  /** Sends one part; reports how many of its bytes have gone out. */
  putPart(token: string, data: Blob, onBytes: (loaded: number) => void, signal?: AbortSignal): Promise<void>;
  /** Tells the Backend the file is complete. Rejects with `code: "parts_missing"` when parts are missing. */
  complete(id: string): Promise<void>;
}

export interface RunOptions {
  concurrency?: number;
  retries?: number;
  /** wait before a retry (ms): tests pass 0 */
  backoffMs?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Slices the file the way the Backend expects: equal parts, a shorter last one. A single upload is one part. */
export function slicePart(file: Blob, partSize: number | undefined, number: number, count: number): Blob {
  if (count <= 1 || !partSize) return file;
  return file.slice((number - 1) * partSize, Math.min(file.size, number * partSize));
}

/** Runs an upload end to end and returns the upload id once the Backend has accepted it for processing. */
export async function runUpload(file: File | (Blob & { name: string }), meta: UploadMeta, io: UploadIO, opts: RunOptions = {}): Promise<string> {
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const retries = opts.retries ?? 3;
  const backoff = opts.backoffMs ?? 800;
  const start = await io.create(meta, { name: file.name, size: file.size });

  const loaded = new Map<number, number>();
  const report = () => {
    let sum = 0;
    for (const v of loaded.values()) sum += v;
    opts.onProgress?.(Math.min(1, sum / Math.max(1, file.size)));
  };
  const count = start.plan.partCount;
  const partSize = start.plan.partSize;
  let tokens = new Map(start.plan.parts.map((p) => [p.number, p.token]));

  async function sendOne(number: number): Promise<void> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (opts.signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
      try {
        const token = tokens.get(number);
        if (!token) throw new Error(`no upload link for part ${number}`);
        const blob = slicePart(file, partSize, number, count);
        await io.putPart(token, blob, (n) => (loaded.set(number, n), report()), opts.signal);
        loaded.set(number, blob.size);
        report();
        return;
      } catch (e) {
        lastErr = e;
        if ((e as Error).name === "AbortError") throw e;
        loaded.set(number, 0);
        report();
        if (attempt === retries) break;
        await sleep(backoff * (attempt + 1));
        // the link may have expired: ask for fresh ones for what is still missing
        if (start.plan.type === "multipart" && attempt >= 1) {
          try {
            const fresh = await io.parts(start.id, file.size);
            for (const p of fresh.parts) tokens.set(p.number, p.token);
          } catch {
            /* keep the old links and try again */
          }
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("The upload failed.");
  }

  async function sendAll(numbers: number[]): Promise<void> {
    const queue = [...numbers];
    let failure: unknown;
    const worker = async () => {
      while (queue.length > 0 && !failure) {
        const n = queue.shift()!;
        try {
          await sendOne(n);
        } catch (e) {
          failure = e;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, numbers.length) }, worker));
    if (failure) throw failure;
  }

  await sendAll(start.plan.parts.map((p) => p.number));

  // complete; if the Backend says parts are missing, send those once more and try again
  for (let round = 0; ; round++) {
    try {
      await io.complete(start.id);
      return start.id;
    } catch (e) {
      if ((e as { code?: string }).code !== "parts_missing" || round >= 2) throw e;
      const fresh = await io.parts(start.id, file.size);
      tokens = new Map(fresh.parts.map((p) => [p.number, p.token]));
      for (const p of fresh.parts) loaded.set(p.number, 0);
      await sendAll(fresh.parts.map((p) => p.number));
    }
  }
}

const AUDIO_EXT = /\.(mp3|wav|flac|m4a|aac|ogg|oga|opus|aiff?|wma)$/i;
export const MAX_AUDIO_BYTES = 2 * 1024 ** 3;

/** "01 - my_song (final).mp3" becomes "my song (final)". */
export function titleFromFilename(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/^\s*\d{1,3}\s*[-_. )]+\s*/, "")
    .replace(/_+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return base || name;
}

/** Why a file cannot be uploaded as a track, or null when it can. */
export function acceptable(file: { name: string; type: string; size: number }): string | null {
  if (!(file.type.startsWith("audio/") || AUDIO_EXT.test(file.name))) return "is not an audio file";
  if (file.size < 1) return "is empty";
  if (file.size > MAX_AUDIO_BYTES) return "is larger than 2 GB";
  return null;
}
