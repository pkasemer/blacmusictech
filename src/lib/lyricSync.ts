// The lyrics timing tool: words are pasted, each line gets the time it is sung, then translations.
// The saved form is the same timed text the lyrics editor uses.

import { checkLyrics, formatStamp, type Lyrics } from "./lyrics";

export interface SyncLine {
  /** "" is a music break */
  text: string;
  timeMs: number | null;
  translation: string;
}

export const BREAK = "♪";
const STAMP_ROW = /^\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/;
/** a heading such as [Chorus] or [Verse 2], not words that are sung */
const HEADING = /^\[[^\]]*\]$/;
const MAX_LINE = 500;
const MAX_LINES = 2000;

export interface Parsed {
  lines: SyncLine[];
  /** headings left out */
  dropped: number;
  error?: string;
}

const blank = (text: string): SyncLine => ({ text, timeMs: null, translation: "" });

/**
 * The pasted words as lines. Lines that were already timed keep their time and translation when the words
 * are edited. Text that already has time stamps is read as timed lyrics.
 */
export function fromWords(raw: string, previous: SyncLine[] = []): Parsed {
  const rows = raw.replace(/\r\n?/g, "\n").split("\n").map((r) => r.trim());
  if (rows.some((r) => STAMP_ROW.test(r))) {
    const c = checkLyrics(raw, 0);
    if (c.errors.length) return { lines: [], dropped: 0, error: `This text has time stamps with a problem. ${c.errors[0]!.message}` };
    return { lines: c.lines.map((l) => ({ text: l.text, timeMs: l.timeMs, translation: l.translation ?? "" })), dropped: 0 };
  }
  let dropped = 0;
  const words: string[] = [];
  for (const [i, row] of rows.entries()) {
    if (!row) continue;
    if (/^\[\d/.test(row)) return { lines: [], dropped: 0, error: `Line ${i + 1} starts like a time stamp but is not one.` };
    if (HEADING.test(row)) dropped++;
    else if (row.length > MAX_LINE) return { lines: [], dropped: 0, error: `Line ${i + 1} is longer than ${MAX_LINE} characters.` };
    else words.push(row === BREAK || row === "🎵" ? "" : row);
  }
  if (words.length > MAX_LINES) return { lines: [], dropped: 0, error: `That is more than ${MAX_LINES} lines.` };
  return { lines: carryOver(words, previous), dropped };
}

/** Keeps times on unchanged lines, and on lines that were only reworded between unchanged ones. */
function carryOver(words: string[], previous: SyncLine[]): SyncLine[] {
  const n = words.length;
  const m = previous.length;
  // longest run of lines, in order, that did not change
  const best = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) best[i]![j] = words[i] === previous[j]!.text ? best[i + 1]![j + 1]! + 1 : Math.max(best[i + 1]![j]!, best[i]![j + 1]!);

  const out = words.map(blank);
  let i = 0;
  let j = 0;
  let fromI = 0;
  let fromJ = 0;
  const reworded = (toI: number, toJ: number) => {
    if (toI - fromI === toJ - fromJ) for (let k = 0; k < toI - fromI; k++) out[fromI + k] = { ...previous[fromJ + k]!, text: words[fromI + k]! };
  };
  while (i < n && j < m) {
    if (words[i] === previous[j]!.text) {
      reworded(i, j);
      out[i] = { ...previous[j]! };
      fromI = ++i;
      fromJ = ++j;
    } else if (best[i + 1]![j]! >= best[i]![j + 1]!) i++;
    else j++;
  }
  reworded(n, m);
  return out;
}

export const toWords = (lines: SyncLine[]) => lines.map((l) => l.text || BREAK).join("\n");

/** What is saved on the server, as lines to work on. */
export function fromSaved(lyrics: Lyrics | null): SyncLine[] {
  if (!lyrics) return [];
  if (lyrics.synced) return lyrics.lines.map((l) => ({ text: l.text, timeMs: l.timeMs, translation: l.translation ?? "" }));
  return fromWords(lyrics.text).lines;
}

/** To the hundredth of a second, the precision lyrics are written in. */
export const stampMs = (seconds: number) => Math.max(0, Math.round(seconds * 100) * 10);

export const setTime = (lines: SyncLine[], index: number, timeMs: number | null) => lines.map((l, i) => (i === index ? { ...l, timeMs } : l));

export const insertBreak = (lines: SyncLine[], index: number, timeMs: number): SyncLine[] => [...lines.slice(0, index), { text: "", timeMs, translation: "" }, ...lines.slice(index)];

export const shiftAll = (lines: SyncLine[], deltaMs: number) => lines.map((l) => (l.timeMs === null ? l : { ...l, timeMs: Math.max(0, l.timeMs + deltaMs) }));

/** The first line still without a time; the number of lines when every one has it. */
export function firstUntimed(lines: SyncLine[]): number {
  const i = lines.findIndex((l) => l.timeMs === null);
  return i < 0 ? lines.length : i;
}

/** What is wrong with a line's time, by line index. */
export function timeProblems(lines: SyncLine[], durationMs: number): Map<number, string> {
  const out = new Map<number, string>();
  let last = -1;
  lines.forEach((l, i) => {
    if (l.timeMs === null) return;
    if (l.timeMs <= last) out.set(i, "Not later than the line above");
    else if (durationMs > 0 && l.timeMs > durationMs && l.text) out.set(i, "After the song ends");
    last = Math.max(last, l.timeMs);
  });
  return out;
}

/** The line being sung at `ms`, or -1 before the first. */
export function activeIndex(lines: SyncLine[], ms: number): number {
  let at = -1;
  let time = -1;
  lines.forEach((l, i) => {
    if (l.timeMs !== null && l.timeMs <= ms && l.timeMs >= time) [at, time] = [i, l.timeMs];
  });
  return at;
}

/** Where line `index` stops: the next timed line, or the end of the song. */
export function lineEnd(lines: SyncLine[], index: number, durationMs: number): number {
  const start = lines[index]?.timeMs ?? 0;
  return lines.slice(index + 1).find((l) => l.timeMs !== null && l.timeMs > start)?.timeMs ?? durationMs;
}

export function progress(lines: SyncLine[]) {
  const sung = lines.filter((l) => l.text);
  return { total: lines.length, timed: lines.filter((l) => l.timeMs !== null).length, sung: sung.length, translated: sung.filter((l) => l.translation.trim()).length };
}

/** Fills translations from `index` onwards with pasted rows, skipping music breaks. */
export function pasteTranslations(lines: SyncLine[], index: number, pasted: string): SyncLine[] {
  const rows = pasted.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n").map((r) => r.trim());
  let k = 0;
  return lines.map((l, i) => (i < index || !l.text || k >= rows.length ? l : { ...l, translation: rows[k++]!.slice(0, MAX_LINE) }));
}

/** The timed text that is saved. Only call once every line has a time. */
export const toLrc = (lines: SyncLine[]) => lines.map((l) => `${formatStamp(l.timeMs ?? 0)}${l.text}${l.text && l.translation.trim() ? `\n${l.translation.trim()}` : ""}`).join("\n");

export const sameLines = (a: SyncLine[], b: SyncLine[]) => a.length === b.length && a.every((l, i) => l.text === b[i]!.text && l.timeMs === b[i]!.timeMs && l.translation.trim() === b[i]!.translation.trim());

// ------------------------------------------------------------ unfinished work, kept in the browser

export interface Draft {
  /** what was saved on the server when this work began */
  base: string;
  lines: SyncLine[];
  /** words typed but not yet turned into lines */
  words: string | null;
  savedAt: number;
}

export const draftKey = (trackId: string) => `blac.lyric-timing.${trackId}`;

export function readDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Draft;
    const ok = typeof d.base === "string" && typeof d.savedAt === "number" && (d.words === null || typeof d.words === "string") && Array.isArray(d.lines) && d.lines.every((l) => typeof l?.text === "string" && typeof l.translation === "string" && (l.timeMs === null || typeof l.timeMs === "number"));
    return ok ? d : null;
  } catch {
    return null;
  }
}
