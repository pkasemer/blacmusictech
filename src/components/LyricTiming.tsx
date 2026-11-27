"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDuration } from "@/lib/format";
import { formatStamp } from "@/lib/lyrics";
import { activeIndex, insertBreak, lineEnd, pasteTranslations, progress, setTime, shiftAll, stampMs, timeProblems, type SyncLine } from "@/lib/lyricSync";
import { IClose, IPause, IPlay } from "./icons";
import type { SongAudio } from "./useSongAudio";
import { Button, Card, ErrorBox, IconButton, Input, Progress, Select, cx } from "./ui";

const clock = (ms: number) => formatStamp(Math.round(ms / 10) * 10).slice(1, -1);
const BACK = 3000;

/** Play, position, seek and speed. */
function Transport({ song }: { song: SongAudio }) {
  const ready = song.status === "ready";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <IconButton label={song.playing ? "Pause (P)" : "Play (P)"} variant="primary" disabled={!ready} onClick={song.toggle}>
        {song.playing ? <IPause size={15} /> : <IPlay size={15} />}
      </IconButton>
      <span className="w-20 text-right font-mono text-sm tabular-nums">{clock(song.now)}</span>
      <input type="range" aria-label="Position in the song" className="h-1 min-w-32 flex-1 cursor-pointer accent-primary" disabled={!ready} min={0} max={Math.max(1, Math.round(song.length))} step={100} value={Math.min(Math.round(song.now), Math.round(song.length))} onChange={(e) => song.seek(Number(e.target.value))} />
      <span className="text-xs tabular-nums text-muted">{fmtDuration(song.length)}</span>
      <Button small disabled={!ready} onClick={() => song.seek(song.now - BACK)}>
        Back 3 s
      </Button>
      <Select aria-label="Playback speed" value={String(song.rate)} disabled={!ready} onChange={(e) => song.setRate(Number(e.target.value))}>
        <option value="0.5">0.5× speed</option>
        <option value="0.75">0.75× speed</option>
        <option value="1">Normal speed</option>
      </Select>
    </div>
  );
}

function SongError({ song }: { song: SongAudio }) {
  if (song.status !== "error") return null;
  return <ErrorBox error={song.error} onRetry={song.reload} />;
}

export function TimingStep({ lines, setLines, song, durationMs, cursor, setCursor }: { lines: SyncLine[]; setLines: (l: SyncLine[]) => void; song: SongAudio; durationMs: number; cursor: number; setCursor: (n: number) => void }) {
  const list = useRef<HTMLOListElement>(null);
  const problems = timeProblems(lines, durationMs || song.length);
  const sounding = activeIndex(lines, song.now);
  const p = progress(lines);
  const next = lines[cursor];
  const ready = song.status === "ready";
  // how things were before each stamp or added break, so undo takes back exactly that
  const history = useRef<{ lines: SyncLine[]; cursor: number; at: number }[]>([]);
  /** any other change to the times: older steps no longer apply */
  const edit = (to: SyncLine[]) => {
    history.current = [];
    setLines(to);
  };

  const stamp = () => {
    if (!ready) return;
    if (!song.playing) return song.play();
    if (!next) return;
    const at = stampMs(song.position());
    history.current.push({ lines, cursor, at });
    setLines(setTime(lines, cursor, at));
    setCursor(cursor + 1);
  };
  const undo = () => {
    const step = history.current.pop();
    if (step) {
      setLines(step.lines);
      setCursor(step.cursor);
      return song.seek(step.at - BACK);
    }
    // after coming back to the page: the nearest timed line before the one waiting
    let i = Math.min(cursor, lines.length) - 1;
    while (i >= 0 && lines[i]!.timeMs === null) i--;
    if (i < 0) return;
    const was = lines[i]!.timeMs!;
    setLines(setTime(lines, i, null));
    setCursor(i);
    song.seek(was - BACK);
  };
  const addBreak = () => {
    if (!ready || !song.playing) return;
    const at = stampMs(song.position());
    history.current.push({ lines, cursor, at });
    setLines(insertBreak(lines, Math.min(cursor, lines.length), at));
    setCursor(cursor + 1);
  };
  const pick = (i: number) => {
    setCursor(i);
    const t = lines[i]!.timeMs;
    if (t !== null) song.seek(t - BACK);
  };
  const nudge = (i: number, delta: number) => {
    const t = Math.max(0, lines[i]!.timeMs! + delta);
    edit(setTime(lines, i, t));
    song.playPart(t, lineEnd(lines, i, song.length));
  };

  // the keyboard drives the whole step; the handler is renewed so it always sees the latest lines
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest("input:not([type=range]), textarea, select, [role=dialog]")) return;
      // Enter keeps its usual job on a focused button or link
      if (e.key === "Enter" && el.closest("button, a")) return;
      const run =
        e.code === "Space" || e.key === "Enter" ? () => !e.repeat && stamp()
        : e.key.toLowerCase() === "p" ? song.toggle
        : e.key.toLowerCase() === "b" ? () => !e.repeat && addBreak()
        : e.key === "Backspace" ? undo
        : e.key === "ArrowLeft" ? () => song.seek(song.now - BACK)
        : e.key === "ArrowRight" ? () => song.seek(song.now + BACK)
        : e.key === "ArrowUp" ? () => setCursor(Math.max(0, cursor - 1))
        : e.key === "ArrowDown" ? () => setCursor(Math.min(lines.length, cursor + 1))
        : null;
      if (!run) return;
      e.preventDefault();
      run();
    };
  });
  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current(e);
    // a focused button would otherwise also "click" when Space is let go
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && (e.target as HTMLElement).closest("button")) e.preventDefault();
    };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
    };
  }, []);

  // keep the waiting line in view, a third of the way down the list
  useEffect(() => {
    const box = list.current;
    const row = box?.children[Math.min(cursor, lines.length - 1)] as HTMLElement | undefined;
    if (box && row) box.scrollTo({ top: row.offsetTop - box.clientHeight / 3, behavior: "smooth" });
  }, [cursor, lines.length]);

  return (
    <div className="space-y-4">
      <SongError song={song} />
      <div className="sticky top-0 z-10 space-y-3 rounded-card border border-line bg-panel p-4 shadow-pop">
        <Transport song={song} />
        <button type="button" onClick={stamp} disabled={!ready || (song.playing && !next)} className="block w-full rounded-card border-2 border-primary bg-primary-soft px-4 py-4 text-center transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">
          <span className="block text-xs font-medium uppercase tracking-wide text-primary-ink">{!ready ? "Loading the song…" : !next ? "Every line is timed" : !song.playing ? "Play (Space)" : "Tap or press Space when you hear"}</span>
          <span className="mt-1 block break-words text-xl font-semibold">{next ? next.text || "♪ Music break" : "✓"}</span>
          {lines[cursor + 1] && <span className="mt-1 block truncate text-sm text-muted">Then: {lines[cursor + 1]!.text || "♪ Music break"}</span>}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Button small onClick={undo} disabled={p.timed === 0}>
            Undo last (⌫)
          </Button>
          <Button small onClick={addBreak} disabled={!ready || !song.playing}>
            ♪ Add music break (B)
          </Button>
          <span className="ml-auto text-sm tabular-nums text-muted" role="status">
            {p.timed} of {p.total} lines timed
          </span>
        </div>
        <Progress value={p.total ? (p.timed / p.total) * 100 : 0} label="Lines timed" tone={p.timed === p.total ? "green" : "blue"} />
      </div>

      <p className="text-xs text-muted">
        <strong>Keys:</strong> Space or Enter stamps the line · P play or pause · ← → jump 3 s · ↑ ↓ choose a line · ⌫ undo · B music break. To redo a line, click it: the song jumps to just before it.
      </p>

      <Card flush>
        <ol ref={list} className="relative max-h-[28rem] overflow-y-auto pb-2">
          {lines.map((l, i) => (
            <li key={i} className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 px-3 py-1.5", i === sounding ? "border-l-success bg-success/10" : "border-l-transparent", i === cursor && "outline-2 -outline-offset-2 outline-primary")}>
              <span className={cx("w-20 shrink-0 font-mono text-xs tabular-nums", l.timeMs === null ? "text-faint" : "text-muted")}>{l.timeMs === null ? "--:--.--" : clock(l.timeMs)}</span>
              <button type="button" onClick={() => pick(i)} aria-current={i === cursor ? "step" : undefined} className="min-w-0 flex-1 basis-40 break-words py-1 text-left text-sm hover:underline">
                {l.text || <span className="text-muted">♪ Music break</span>}
              </button>
              {problems.has(i) && <span className="text-xs font-medium text-danger-ink">{problems.get(i)}</span>}
              {i === cursor && i !== sounding && <span className="text-xs font-medium text-primary-ink">Next to stamp</span>}
              {l.timeMs !== null && (
                <span className="flex items-center gap-1">
                  <IconButton small label={`Play line ${i + 1}`} disabled={!ready} onClick={() => song.playPart(l.timeMs!, lineEnd(lines, i, song.length))}>
                    <IPlay size={13} />
                  </IconButton>
                  <Button small aria-label={`Line ${i + 1} earlier by a tenth of a second`} onClick={() => nudge(i, -100)}>
                    −0.1
                  </Button>
                  <Button small aria-label={`Line ${i + 1} later by a tenth of a second`} onClick={() => nudge(i, 100)}>
                    +0.1
                  </Button>
                </span>
              )}
              {!l.text && (
                <IconButton small label={`Remove music break at line ${i + 1}`} onClick={() => (edit(lines.filter((_, k) => k !== i)), setCursor(cursor > i ? cursor - 1 : cursor))}>
                  <IClose size={13} />
                </IconButton>
              )}
            </li>
          ))}
        </ol>
      </Card>

      {p.timed > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Everything a bit off? Move all times:</span>
          <Button small onClick={() => edit(shiftAll(lines, -100))}>
            0.1 s earlier
          </Button>
          <Button small onClick={() => edit(shiftAll(lines, 100))}>
            0.1 s later
          </Button>
          <Button small className="ml-auto" onClick={() => (edit(lines.map((l) => ({ ...l, timeMs: null }))), setCursor(0), song.seek(0))}>
            Clear all times
          </Button>
        </div>
      )}
    </div>
  );
}

export function TranslationStep({ lines, setLines, song }: { lines: SyncLine[]; setLines: (l: SyncLine[]) => void; song: SongAudio }) {
  const [follow, setFollow] = useState(false);
  const boxes = useRef(new Map<number, HTMLInputElement>());
  const p = progress(lines);
  const sounding = activeIndex(lines, song.now);
  const part = (i: number) => song.playPart(lines[i]!.timeMs!, lineEnd(lines, i, song.length));
  const focusNext = (i: number) => {
    for (let k = i + 1; k < lines.length; k++) {
      const el = boxes.current.get(k);
      if (el) return el.focus();
    }
  };

  return (
    <div className="space-y-4">
      <SongError song={song} />
      <div className="sticky top-0 z-10 space-y-3 rounded-card border border-line bg-panel p-4 shadow-pop">
        <Transport song={song} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-primary" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            Play each line when I start typing its translation
          </label>
          <span className="ml-auto tabular-nums text-muted" role="status">
            {p.translated} of {p.sung} translated
          </span>
        </div>
      </div>
      <p className="text-xs text-muted">English translations are optional: leave a line empty if it needs none. Enter moves to the next line. Pasting several lines fills one box each.</p>
      <Card flush>
        <ol className="divide-y divide-line pb-1">
          {lines.map((l, i) => (
            <li key={i} className={cx("flex items-start gap-3 border-l-4 px-3 py-2.5", i === sounding && song.playing ? "border-l-success bg-success/10" : "border-l-transparent")}>
              <IconButton small label={`Play line ${i + 1}`} disabled={song.status !== "ready"} onClick={() => part(i)}>
                <IPlay size={13} />
              </IconButton>
              <span className="w-16 shrink-0 pt-1.5 font-mono text-xs tabular-nums text-muted">{clock(l.timeMs ?? 0)}</span>
              {l.text ? (
                <div className="grid min-w-0 flex-1 items-center gap-x-4 gap-y-1.5 lg:grid-cols-2">
                  <span className="break-words text-sm font-medium">{l.text}</span>
                  <Input
                    ref={(el) => {
                      if (el) boxes.current.set(i, el);
                      else boxes.current.delete(i);
                    }}
                    aria-label={`English for line ${i + 1}: ${l.text}`}
                    placeholder="English (optional)"
                    maxLength={500}
                    value={l.translation}
                    onFocus={() => {
                      if (follow && song.status === "ready") part(i);
                    }}
                    onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, translation: e.target.value } : x)))}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      focusNext(i);
                    }}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      if (!text.trim().includes("\n")) return;
                      e.preventDefault();
                      setLines(pasteTranslations(lines, i, text));
                    }}
                  />
                </div>
              ) : (
                <span className="pt-1.5 text-sm text-muted">♪ Music break</span>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
