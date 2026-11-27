// Lyrics with translations: the same rules as the Backend, with the line number of each problem.

import { describe, expect, it } from "vitest";
import { checkLyrics, editable, formatStamp, lineRange, serverErrors } from "@/lib/lyrics";

const messages = (text: string, duration = 0) => checkLyrics(text, duration).errors.map((e) => e.message);
const example = "[00:12.50]Nkwagala nnyo\nI love you so much\n[00:17.20]Oh yeah\n[00:21.00]Tuula nange\nStay with me\n[00:25.40]\n[00:31.00]Nkwagala\nI love you";

describe("lyrics", () => {
  it("pairs each lyric with the line directly under it", () => {
    const c = checkLyrics(example, 60_000);
    expect(c.errors).toEqual([]);
    expect([c.kind, c.lyricLines, c.translated, c.breaks]).toEqual(["timed", 4, 3, 1]);
    expect(c.lines[0]).toEqual({ timeMs: 12_500, text: "Nkwagala nnyo", translation: "I love you so much" });
    expect(c.lines[1]!.translation).toBeUndefined();
  });

  it("names the line of a translation with nowhere to go", () => {
    expect(messages("English\n[00:01.00]a")).toEqual(["Line 1 has no time stamp. A translation goes directly under its lyric line, one per line."]);
    expect(checkLyrics("[00:01.00]a\n\nb", 0).errors[0]!.line).toBe(3);
    expect(checkLyrics("[00:01.00]a\nb\nc", 0).errors[0]!.line).toBe(3);
    expect(messages("[00:01.00]\nbreak words")).toEqual(["Line 2: a music break has no translation."]);
  });

  it("checks the times", () => {
    expect(messages("[00:75.00]a\nb")).toEqual(["Line 1: write the time as [mm:ss.xx], for example [01:07.50]."]);
    expect(messages("[00:05.00]a\n[1:2]b")).toEqual(["Line 2: write the time as [mm:ss.xx], for example [01:07.50]."]);
    expect(messages("[00:05.00]a\n[00:04.00]b")).toEqual(["Line 2: its time must be after [00:05.00] on line 1."]);
    expect(messages("[00:05.00]a\n[00:05.00]b")).toEqual(["Line 2: A translation line has no time stamp."]);
    expect(messages("[02:00.00]a", 90_000)).toEqual(["Line 1 is after the song ends (1:30)."]);
    expect(messages("[02:00.00]a\n[02:01.00]", 150_000)).toEqual([]);
  });

  it("allows repeated lines, tags and an offset", () => {
    const c = checkLyrics("[ar: Someone]\n[offset:+500]\n[00:30.00][00:10.00]Chorus\nIt repeats\n[00:15.00]<00:15.20>word", 0);
    expect(c.errors).toEqual([]);
    expect(c.lines.map((l) => [l.timeMs, l.text, l.translation])).toEqual([[9500, "Chorus", "It repeats"], [14_500, "word", undefined], [29_500, "Chorus", "It repeats"]]);
  });

  it("treats text without any time as plain lyrics", () => {
    expect(checkLyrics("[Chorus]\nla la", 0)).toMatchObject({ kind: "plain", errors: [] });
    expect(checkLyrics("  \n ", 0).kind).toBe("empty");
    expect(messages("[00:01.00]")).toEqual(["No lyric lines found: write lines like [01:23.45]words."]);
    expect(messages("[00:01.00]" + "x".repeat(501))).toEqual(["Line 1 is longer than 500 characters."]);
  });

  it("puts saved lyrics back in the box and finds a line in it", () => {
    expect(formatStamp(67_500)).toBe("[01:07.50]");
    expect(formatStamp(1005)).toBe("[00:01.005]");
    expect(editable({ synced: true, text: "a", lines: [{ timeMs: 1000, text: "a", translation: "b" }] })).toBe("[00:01.00]a\nb");
    expect(lineRange("ab\ncd\ne", 2)).toEqual([3, 5]);
    expect(serverErrors({ errors: [{ line: 2, message: "m" }, { nope: 1 }] })).toEqual([{ line: 2, message: "m" }]);
  });
});
