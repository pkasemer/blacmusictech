// Lyrics with English translations: the same format and rules as the Backend (internal/lyrics/lrc.go),
// checked while the admin types. A lyric line starts with a time stamp; the line directly under it,
// with no stamp, is its translation.

export interface LyricLine {
  timeMs: number;
  text: string;
  translation?: string;
}

export interface Lyrics {
  synced: boolean;
  lines: LyricLine[];
  /** the plain lyrics, never with translations */
  text: string;
  /** timed lyrics as typed */
  lrc?: string;
}

export interface LyricsView {
  trackId: string;
  title: string;
  durationMs: number;
  lyrics: Lyrics | null;
  untranslatedLines: number;
}

export interface LineError {
  /** line number in the text as typed; 0 for a problem with the whole text */
  line: number;
  message: string;
}

export interface Checked {
  kind: "empty" | "plain" | "timed";
  errors: LineError[];
  /** timed lyrics in playing order, as listeners would get them */
  lines: LyricLine[];
  lyricLines: number;
  translated: number;
  breaks: number;
}

const MAX_TEXT = 20_000;
const MAX_TYPED = 100_000;
const MAX_LINES = 2000;
const MAX_LINE = 500;
const MAX_ERRORS = 100;

const STAMP = /^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/;
/** meant as a time stamp */
const LIKE = /^\[\d/;
const TAG = /^\[([A-Za-z#]+):([^\]]*)\]\s*$/;
const WORD_TIME = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

const length = (s: string) => [...s].length;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function formatStamp(ms: number): string {
  const head = `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}`;
  return ms % 10 === 0 ? `[${head}.${pad((ms % 1000) / 10)}]` : `[${head}.${pad(ms % 1000, 3)}]`;
}

const badStamp = (n: number) => `Line ${n}: write the time as [mm:ss.xx], for example [01:07.50].`;
const normalize = (s: string) => s.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

/** Checks what is in the box. `durationMs` is the song's length, 0 when unknown. */
export function checkLyrics(source: string, durationMs: number): Checked {
  const result: Checked = { kind: "empty", errors: [], lines: [], lyricLines: 0, translated: 0, breaks: 0 };
  const rows = normalize(source).split("\n").map((r) => r.trim());
  if (rows.every((r) => !r)) return result;

  if (!rows.some((r) => LIKE.test(r))) {
    result.kind = "plain";
    result.lyricLines = rows.filter(Boolean).length;
    if (length(normalize(source).trim()) > MAX_TEXT) result.errors.push({ line: 0, message: "The lyrics are too long (20,000 characters at most)." });
    return result;
  }

  result.kind = "timed";
  const wrong: LineError[] = [];
  const report = (line: number, message: string) => {
    if (wrong.length < MAX_ERRORS) wrong.push({ line, message });
  };
  type Entry = { times: number[]; text: string; translation: string; line: number };
  const entries: Entry[] = [];
  let open: Entry | null = null; // the lyric line directly above, which a translation may follow
  let offset = 0;
  let lastTime = -1;
  let lastLine = 0;
  let count = 0;

  rows.forEach((row, i) => {
    const n = i + 1;
    let s = row;
    if (!s) {
      open = null;
      return;
    }
    if (!STAMP.test(s)) {
      const tag = TAG.exec(s);
      if (tag) {
        const value = tag[2]!.trim().replace(/^\+/, "");
        if (tag[1]!.toLowerCase() === "offset" && /^[+-]?\d+$/.test(value)) offset = Number(value);
        open = null;
        return;
      }
      if (LIKE.test(s)) {
        report(n, badStamp(n));
        open = null;
        return;
      }
      const text = s.replace(WORD_TIME, "").trim();
      if (!open) report(n, `Line ${n} has no time stamp. A translation goes directly under its lyric line, one per line.`);
      else if (!open.text) report(n, `Line ${n}: a music break has no translation.`);
      else if (length(text) > MAX_LINE) report(n, `Line ${n} is longer than ${MAX_LINE} characters.`);
      else open.translation = text;
      open = null; // one translation to a line
      return;
    }
    const entry: Entry = { times: [], text: "", translation: "", line: n };
    let bad = false;
    for (let m = STAMP.exec(s); m; m = STAMP.exec(s)) {
      const seconds = Number(m[2]);
      const fraction = m[3] ? Number(m[3].padEnd(3, "0")) : 0;
      bad ||= seconds > 59;
      entry.times.push((Number(m[1]) * 60 + seconds) * 1000 + fraction);
      s = s.slice(m[0].length).replace(/^[ \t]+/, "");
    }
    if (bad || LIKE.test(s)) {
      report(n, badStamp(n));
      entry.text = "?"; // so that its translation is not also an error
      open = entry;
      return;
    }
    entry.text = s.replace(WORD_TIME, "").trim();
    if (length(entry.text) > MAX_LINE) report(n, `Line ${n} is longer than ${MAX_LINE} characters.`);
    // lines with one time run forwards; a shared (repeated) line may point anywhere
    if (entry.times.length === 1) {
      const t = entry.times[0]!;
      if (t === lastTime) report(n, `Line ${n}: A translation line has no time stamp.`);
      else if (t < lastTime) report(n, `Line ${n}: its time must be after ${formatStamp(lastTime)} on line ${lastLine}.`);
      else [lastTime, lastLine] = [t, n];
    }
    entries.push(entry);
    open = entry;
    count += entry.times.length;
  });

  const lines: LyricLine[] = [];
  for (const e of entries) {
    let late = false;
    for (const t of e.times) {
      const at = Math.max(t - offset, 0);
      late ||= durationMs > 0 && at > durationMs && e.text !== "";
      lines.push({ timeMs: at, text: e.text, ...(e.translation ? { translation: e.translation } : {}) });
    }
    if (late) report(e.line, `Line ${e.line} is after the song ends (${Math.floor(durationMs / 60000)}:${pad(Math.floor(durationMs / 1000) % 60)}).`);
    if (e.text) {
      result.lyricLines++;
      if (e.translation) result.translated++;
    }
  }
  lines.sort((a, b) => a.timeMs - b.timeMs);
  while (lines.length && !lines[lines.length - 1]!.text) lines.pop(); // no empty lines at the end

  if (count > MAX_LINES) report(0, `Too many lines (${MAX_LINES} at most).`);
  if (length(source) > MAX_TYPED || length(lines.map((l) => l.text).join("\n")) > MAX_TEXT) report(0, "The lyrics are too long.");
  if (!lines.length && !wrong.length) report(0, "No lyric lines found: write lines like [01:23.45]words.");

  result.errors = wrong.sort((a, b) => a.line - b.line);
  result.lines = lines;
  result.breaks = lines.filter((l) => !l.text).length;
  return result;
}

/** What is saved, as it goes back into the box. */
export const editable = (lyrics: Lyrics | null) => (!lyrics ? "" : lyrics.synced ? (lyrics.lrc ?? lyrics.lines.map((l) => `${formatStamp(l.timeMs)}${l.text}${l.translation ? `\n${l.translation}` : ""}`).join("\n")) : lyrics.text);

/** Where line `n` (from 1) starts and ends in the text, to select it. */
export function lineRange(text: string, n: number): [number, number] {
  const rows = text.split("\n");
  const start = rows.slice(0, n - 1).reduce((sum, r) => sum + r.length + 1, 0);
  return [start, start + (rows[n - 1]?.length ?? 0)];
}

/** The line-by-line problems in a refused save. */
export function serverErrors(details: unknown): LineError[] {
  const list = (details as { errors?: unknown } | undefined)?.errors;
  return Array.isArray(list) ? list.filter((e): e is LineError => typeof e?.line === "number" && typeof e?.message === "string") : [];
}
