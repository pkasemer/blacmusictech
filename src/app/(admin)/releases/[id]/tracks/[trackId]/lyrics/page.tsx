"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { usePageTitle } from "@/components/page-meta";
import { PlayButton } from "@/components/Player";
import { useToast } from "@/components/Shell";
import { Button, Card, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fmtDuration } from "@/lib/format";
import { checkLyrics, editable, formatStamp, lineRange, serverErrors, type Checked, type LineError, type LyricsView } from "@/lib/lyrics";
import type { ReleaseDetail } from "@/lib/types";
import { useUnsavedGuard } from "@/lib/unsaved";
import { useApi } from "@/lib/useApi";

const EXAMPLE = `[00:12.50]Nkwagala nnyo
I love you so much
[00:17.20]Oh yeah
[00:21.00]Tuula nange
Stay with me
[00:25.40]
[00:31.00]Nkwagala
I love you`;

export default function LyricsPage() {
  const { id, trackId } = useParams<{ id: string; trackId: string }>();
  const q = useApi<LyricsView>(`/tracks/${trackId}/lyrics`);
  const release = useApi<ReleaseDetail>(`/releases/${id}`);
  // the answer to the last save or removal, newer than what was read
  const [saved, setSaved] = useState<LyricsView>();
  const view = saved?.trackId === trackId ? saved : q.data?.trackId === trackId ? q.data : undefined;
  usePageTitle(view ? `Lyrics: ${view.title}` : undefined, "release");

  if (q.error) return <ErrorBox error={q.error.code === "not_available" ? "The server cannot edit lyrics yet. It needs the latest Backend update." : q.error} onRetry={q.reload} />;
  if (!view) return <Loading />;
  return <Editor key={`${view.trackId}|${editable(view.lyrics)}`} view={view} release={release.data} releaseId={id} onSaved={setSaved} />;
}

function Help() {
  return (
    <Card title="How to write lyrics">
      <div className="grid gap-4 text-sm lg:grid-cols-2">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Start each sung line with its time, <code>[mm:ss.xx]</code>, then the words. <code>[01:07.50]</code> is 1 minute, 7 and a half seconds. This is when the line lights up in the app.
          </li>
          <li>
            An English translation is optional. Put it on the line <strong>directly under</strong> its lyric, with <strong>no time</strong>. One translation per lyric.
          </li>
          <li>Skip the translation when a line needs none, such as one already in English.</li>
          <li>A time with no words is a music break. It has no translation.</li>
          <li>Blank lines between pairs are fine, but never between a lyric and its translation.</li>
          <li>Each time must be later than the one before and within the song. To repeat a chorus you can put several times before one line.</li>
          <li>With no times at all, the words are saved as plain lyrics: they do not scroll and have no translations.</li>
        </ul>
        <figure>
          <figcaption className="mb-1 text-xs font-medium text-muted">Example (the second lyric has no translation, the empty time is a music break)</figcaption>
          <pre className="overflow-x-auto rounded-control border border-line bg-sunken px-3 py-2 font-mono text-xs leading-5">{EXAMPLE}</pre>
        </figure>
      </div>
    </Card>
  );
}

function Editor({ view, release, releaseId, onSaved }: { view: LyricsView; release: ReleaseDetail | undefined; releaseId: string; onSaved: (v: LyricsView) => void }) {
  const toast = useToast();
  const original = editable(view.lyrics);
  const [text, setText] = useState(original);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [refused, setRefused] = useState<{ text: string; message: string; errors: LineError[] }>();
  const box = useRef<HTMLTextAreaElement>(null);
  const numbers = useRef<HTMLPreElement>(null);
  const id = useId();
  const dirty = text !== original;
  useUnsavedGuard(dirty);

  const checked = checkLyrics(text, view.durationMs);
  // what the server said holds until the text changes
  const server = refused?.text === text ? refused : undefined;
  const errors = checked.errors.length ? checked.errors : (server?.errors ?? []);
  const badLines = new Set(errors.map((e) => e.line));
  const rows = text.split("\n").length;
  const track = release?.tracks.find((t) => t.id === view.trackId);

  const jump = (line: number) => {
    const el = box.current;
    if (!el) return;
    const [from, to] = lineRange(el.value, line);
    el.focus();
    el.setSelectionRange(from, to);
    el.scrollTop = Math.max(0, (line - 4) * 20);
  };

  async function save() {
    setBusy(true);
    setRefused(undefined);
    try {
      const v = await api<LyricsView>(`/tracks/${view.trackId}/lyrics`, { method: "PUT", body: checked.kind === "timed" ? { lrc: text } : { text } });
      toast("Lyrics saved");
      onSaved(v);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "error", "Could not save.");
      setRefused({ text, message: err.message, errors: serverErrors(err.details) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={`Lyrics: ${view.title}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/releases/${releaseId}`} className="text-primary hover:underline">
              {release?.title ?? "Back to the release"}
            </Link>
            <span>Song length {fmtDuration(view.durationMs)}</span>
            {track && <PlayButton track={{ id: view.trackId, title: view.title, artist: release!.artistName }} disabled={track.visibility !== "public"} />}
          </span>
        }
        actions={
          <>
            {view.lyrics && (
              <Button onClick={() => setRemoving(true)} className="text-danger-ink">
                Remove lyrics
              </Button>
            )}
            <Link href={`/releases/${releaseId}/tracks/${view.trackId}/lyrics/sync`}>
              <Button variant="primary">Time with the song</Button>
            </Link>
          </>
        }
      />
      <div className="space-y-4">
        <Help />
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <Card title="Lyrics">
            <label htmlFor={id} className="sr-only">
              Lyrics and translations
            </label>
            <div className="flex overflow-hidden rounded-control border border-line bg-panel focus-within:border-primary">
              <pre ref={numbers} aria-hidden className="h-96 select-none overflow-hidden border-r border-line bg-sunken py-2 pl-2 pr-1.5 text-right font-mono text-xs leading-5 text-faint">
                {Array.from({ length: rows }, (_, i) => (
                  <div key={i} className={badLines.has(i + 1) ? "bg-danger/10 font-bold text-danger-ink" : undefined}>
                    {i + 1}
                  </div>
                ))}
                <div>&nbsp;</div>
              </pre>
              <textarea
                id={id}
                ref={box}
                value={text}
                wrap="off"
                spellCheck={false}
                aria-invalid={errors.length > 0}
                placeholder={"Paste or type here, for example:\n\n[00:12.50]The line as sung\nIts English translation (optional)"}
                onChange={(e) => setText(e.target.value)}
                onScroll={(e) => {
                  if (numbers.current) numbers.current.scrollTop = e.currentTarget.scrollTop;
                }}
                className="h-96 min-w-0 flex-1 resize-none whitespace-pre px-3 py-2 font-mono text-xs leading-5 outline-none placeholder:text-faint"
              />
            </div>
            <Status checked={checked} errors={errors} message={server && !errors.length ? server.message : ""} onJump={jump} />
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-sm text-muted" role="status">
                {dirty ? "You have unsaved changes." : "No unsaved changes."}
              </span>
              <Button disabled={!dirty || busy} onClick={() => setText(original)}>
                Discard
              </Button>
              <Button variant="primary" disabled={!dirty || busy || checked.kind === "empty" || errors.length > 0} onClick={() => void save()}>
                {busy ? "Saving…" : "Save lyrics"}
              </Button>
            </div>
          </Card>
          <Preview checked={checked} text={text} />
        </div>
      </div>
      <ConfirmDialog
        open={removing}
        title="Remove the lyrics?"
        description={`The lyrics and translations of "${view.title}" are deleted from the app. This cannot be undone.`}
        confirmLabel="Remove lyrics"
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          await api(`/tracks/${view.trackId}/lyrics`, { method: "DELETE" });
          toast("Lyrics removed");
          onSaved({ ...view, lyrics: null, untranslatedLines: 0 });
        }}
      />
    </>
  );
}

function Status({ checked, errors, message, onJump }: { checked: Checked; errors: LineError[]; message: string; onJump: (line: number) => void }) {
  const missing = checked.lyricLines - checked.translated;
  return (
    <div className="mt-2 space-y-2 text-sm" aria-live="polite">
      {message && <ErrorBox error={message} />}
      {errors.length > 0 ? (
        <div className="rounded-control border border-danger/25 bg-danger/5 px-3 py-2 text-danger-ink">
          <p className="font-medium">
            Fix {errors.length === 1 ? "this problem" : `these ${errors.length} problems`} to save:
          </p>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
            {errors.map((e, i) => (
              <li key={`${e.line}-${i}`}>
                {e.line > 0 ? (
                  <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onJump(e.line)}>
                    {e.message}
                  </button>
                ) : (
                  e.message
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : checked.kind === "plain" ? (
        <p className="rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-warning-ink">
          No times found, so this is saved as plain lyrics: it will not scroll with the song, and every line counts as sung words. For translations, add a time to each lyric line.
        </p>
      ) : checked.kind === "timed" ? (
        <>
          <p className="text-success-ink">
            ✓ Ready: {checked.lyricLines} lyric line{checked.lyricLines === 1 ? "" : "s"}, {checked.translated} translated, {checked.breaks} music break{checked.breaks === 1 ? "" : "s"}.
          </p>
          {missing > 0 && (
            <p className="text-muted">
              {missing} lyric line{missing === 1 ? " has" : "s have"} no translation. That is fine if intended.
            </p>
          )}
        </>
      ) : (
        <p className="text-muted">Type or paste the lyrics. They are checked as you type.</p>
      )}
    </div>
  );
}

function Preview({ checked, text }: { checked: Checked; text: string }) {
  const [translations, setTranslations] = useState(true);
  return (
    <Card
      title="Preview"
      actions={
        checked.kind === "timed" ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={translations} onChange={(e) => setTranslations(e.target.checked)} />
            Show translations
          </label>
        ) : undefined
      }
    >
      <div className="max-h-96 overflow-y-auto">
        {checked.kind === "empty" ? (
          <p className="text-sm text-muted">The lines appear here as listeners will see them.</p>
        ) : checked.kind === "plain" ? (
          <p className="whitespace-pre-wrap break-words text-sm">{text.trim()}</p>
        ) : (
          <>
            {checked.errors.length > 0 && <p className="mb-2 text-xs text-muted">Lines with problems may be missing or wrong until fixed.</p>}
            <ol className="space-y-2">
              {checked.lines.map((l, i) => (
                <li key={`${l.timeMs}-${i}`} className="flex gap-3">
                  <span className="w-20 shrink-0 pt-0.5 font-mono text-xs text-muted">{formatStamp(l.timeMs).slice(1, -1)}</span>
                  <span className="min-w-0 break-words">
                    {l.text ? <span className="block text-sm font-medium">{l.text}</span> : <span className="block text-sm text-muted">♪ Music break</span>}
                    {translations && l.translation && <span className="block text-sm text-muted">{l.translation}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Card>
  );
}
