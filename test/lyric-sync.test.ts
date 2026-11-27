// The timing tool: pasted words, times that survive edits, and text the server accepts.

import { describe, expect, it } from "vitest";
import { checkLyrics } from "@/lib/lyrics";
import { activeIndex, firstUntimed, fromSaved, fromWords, insertBreak, lineEnd, pasteTranslations, progress, readDraft, sameLines, setTime, shiftAll, stampMs, timeProblems, toLrc, toWords, type SyncLine } from "@/lib/lyricSync";

const line = (text: string, timeMs: number | null = null, translation = ""): SyncLine => ({ text, timeMs, translation });
const timed = [line("one", 1000, "a"), line("two", 2000, "b"), line("three", 3000, "c")];

describe("lyric timing", () => {
  it("reads pasted words, leaving out empty lines and headings", () => {
    const p = fromWords("[Verse 1]\r\n one \n\n♪\ntwo\n[Chorus]\n");
    expect([p.lines.map((l) => l.text), p.dropped, p.error]).toEqual([["one", "", "two"], 2, undefined]);
    expect(toWords(p.lines)).toBe("one\n♪\ntwo");
    expect(fromWords("[1:2 oops").error).toContain("Line 1");
    expect(fromWords("x".repeat(501)).error).toContain("longer than 500");
  });

  it("reads text that already has times", () => {
    expect(fromWords("[00:01.00]one\nuno\n[00:02.00]two").lines).toEqual([line("one", 1000, "uno"), line("two", 2000)]);
    expect(fromWords("[00:02.00]one\n[00:01.00]two").error).toContain("Line 2");
  });

  it("keeps times and translations when the words are edited", () => {
    expect(fromWords("one\nTWO fixed\nthree", timed).lines).toEqual([timed[0], line("TWO fixed", 2000, "b"), timed[2]]);
    expect(fromWords("new\none\ntwo\nthree", timed).lines).toEqual([line("new"), ...timed]);
    expect(fromWords("one\nthree", timed).lines).toEqual([timed[0], timed[2]]);
    expect(fromWords("one\nx\ny\nthree", timed).lines.map((l) => l.timeMs)).toEqual([1000, null, null, 3000]);
  });

  it("stamps, undoes, breaks and finds what is being sung", () => {
    expect(stampMs(12.3456)).toBe(12_350);
    expect(stampMs(-1)).toBe(0);
    const some = [line("one", 1000), line("two"), line("three")];
    expect(firstUntimed(some)).toBe(1);
    expect(firstUntimed(setTime(setTime(some, 1, 2000), 2, 3000))).toBe(3);
    expect(insertBreak(some, 1, 1500).map((l) => l.text)).toEqual(["one", "", "two", "three"]);
    expect([activeIndex(timed, 500), activeIndex(timed, 2500), activeIndex(timed, 9000)]).toEqual([-1, 1, 2]);
    expect([lineEnd(timed, 0, 9000), lineEnd(timed, 2, 9000)]).toEqual([2000, 9000]);
    expect(shiftAll([line("a", 50), line("b")], -100).map((l) => l.timeMs)).toEqual([0, null]);
  });

  it("marks times that run backwards or past the end", () => {
    expect([...timeProblems(timed, 60_000)]).toEqual([]);
    expect([...timeProblems(setTime(timed, 1, 1000), 60_000).keys()]).toEqual([1]);
    expect([...timeProblems(timed, 2500).values()]).toEqual(["After the song ends"]);
  });

  it("writes text that passes the same checks the server uses, and reads it back", () => {
    const lines = [line("one", 1000, " uno "), line("", 2000, "ignored"), line("two", 3000)];
    const lrc = toLrc(lines);
    expect(lrc).toBe("[00:01.00]one\nuno\n[00:02.00]\n[00:03.00]two");
    const c = checkLyrics(lrc, 60_000);
    expect(c.errors).toEqual([]);
    expect(sameLines(fromSaved({ synced: true, text: "", lines: c.lines }), [line("one", 1000, "uno"), line("", 2000), line("two", 3000)])).toBe(true);
    expect(fromSaved({ synced: false, text: "a\n\nb", lines: [] })).toEqual([line("a"), line("b")]);
  });

  it("counts translations and fills several from one paste", () => {
    const lines = [line("one", 1), line("", 2), line("two", 3), line("three", 4)];
    const filled = pasteTranslations(lines, 0, "uno\ndos\n");
    expect(filled.map((l) => l.translation)).toEqual(["uno", "", "dos", ""]);
    expect(progress(filled)).toEqual({ total: 4, timed: 4, sung: 3, translated: 2 });
  });

  it("only restores unfinished work it can read", () => {
    const d = { base: "", lines: timed, words: null, savedAt: 1 };
    expect(readDraft(JSON.stringify(d))).toEqual(d);
    expect(readDraft("{oops")).toBeNull();
    expect(readDraft(JSON.stringify({ ...d, lines: [{ text: 1 }] }))).toBeNull();
    expect(readDraft(null)).toBeNull();
  });
});
