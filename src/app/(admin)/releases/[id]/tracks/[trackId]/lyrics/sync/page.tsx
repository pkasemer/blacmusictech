"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TimingStep, TranslationStep } from "@/components/LyricTiming";
import { usePageTitle } from "@/components/page-meta";
import { usePlayer } from "@/components/Player";
import { useToast } from "@/components/Shell";
import { useSongAudio } from "@/components/useSongAudio";
import { Button, Card, ErrorBox, Loading, PageHeader, Textarea, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { checkLyrics, editable, serverErrors, type LyricsView } from "@/lib/lyrics";
import { draftKey, firstUntimed, fromSaved, fromWords, progress, readDraft, sameLines, timeProblems, toLrc, toWords, type Draft, type SyncLine } from "@/lib/lyricSync";
import type { ReleaseDetail } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Step = "words" | "time" | "translate";

export default function LyricTimingPage() {
  const { id, trackId } = useParams<{ id: string; trackId: string }>();
  const q = useApi<LyricsView>(`/tracks/${trackId}/lyrics`);
  const release = useApi<ReleaseDetail>(`/releases/${id}`);
  const view = q.data?.trackId === trackId ? q.data : undefined;
  usePageTitle(view ? `Time lyrics: ${view.title}` : undefined, "release");

  if (q.error) return <ErrorBox error={q.error.code === "not_available" ? "The server cannot edit lyrics yet. It needs the latest Backend update." : q.error} onRetry={q.reload} />;
  if (!view) return <Loading />;
  return <Studio key={view.trackId} first={view} release={release.data} releaseId={id} />;
}

// private windows and full storage must not break the tool
const store = {
  get: (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string | null) => {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};

const startStep = (lines: SyncLine[]): Step => (lines.length === 0 ? "words" : firstUntimed(lines) < lines.length ? "time" : "translate");

function Studio({ first, release, releaseId }: { first: LyricsView; release: ReleaseDetail | undefined; releaseId: string }) {
  const toast = useToast();
  const [view, setView] = useState(first);
  const key = draftKey(view.trackId);
  // read once: this only renders in the browser, after the saved lyrics have arrived
  const [restored, setRestored] = useState<Draft | null>(() => readDraft(store.get(key)));
  const saved = fromSaved(view.lyrics);
  const base = editable(view.lyrics);
  const [lines, setLines] = useState<SyncLine[]>(() => restored?.lines ?? fromSaved(first.lyrics));
  const [words, setWords] = useState<string | null>(() => restored?.words ?? null);
  const [step, setStep] = useState<Step>(() => (restored?.words != null ? "words" : startStep(restored?.lines ?? fromSaved(first.lyrics))));
  const [cursor, setCursor] = useState(() => firstUntimed(restored?.lines ?? fromSaved(first.lyrics)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [kept, setKept] = useState(true);
  const [discarding, setDiscarding] = useState(false);
  const song = useSongAudio(view.trackId);
  const wordsId = useId();

  // two songs at once would be confusing
  const { close } = usePlayer();
  useEffect(() => close(), [close]);

  const synced = !!view.lyrics?.synced;
  const changed = words !== null || (synced ? !sameLines(lines, saved) : lines.length > 0 && !(view.lyrics && sameLines(lines, saved)));

  // unfinished work stays in this browser until it is saved
  useEffect(() => {
    const ok = store.set(key, changed ? JSON.stringify({ base, lines, words, savedAt: Date.now() } satisfies Draft) : null);
    if (!ok && changed) queueMicrotask(() => setKept(false));
  }, [key, base, lines, words, changed]);
  useEffect(() => {
    if (kept || !changed) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [kept, changed]);

  const p = progress(lines);
  const allTimed = p.total > 0 && p.timed === p.total;
  const problems = timeProblems(lines, view.durationMs);
  const canSave = allTimed && problems.size === 0 && changed && words === null && !busy;
  const track = release?.tracks.find((t) => t.id === view.trackId);
  const typed = words ?? toWords(lines);
  const parsed = step === "words" ? fromWords(typed, lines) : null;

  const go = (to: Step) => {
    if (to !== "translate") setCursor(firstUntimed(lines));
    setError("");
    setStep(to);
  };

  const useWords = () => {
    if (!parsed || parsed.error || parsed.lines.length === 0) return;
    setLines(parsed.lines);
    setWords(null);
    setCursor(firstUntimed(parsed.lines));
    setError("");
    setStep(firstUntimed(parsed.lines) < parsed.lines.length ? "time" : "translate");
  };

  async function save() {
    const lrc = toLrc(lines);
    const problem = checkLyrics(lrc, view.durationMs).errors[0];
    if (problem) return setError(problem.message);
    setBusy(true);
    setError("");
    try {
      const v = await api<LyricsView>(`/tracks/${view.trackId}/lyrics`, { method: "PUT", body: { lrc } });
      setView(v);
      setLines(fromSaved(v.lyrics));
      setRestored(null);
      toast("Lyrics saved");
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "error", "Could not save. Your work is still here.");
      setError(serverErrors(err.details)[0]?.message ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  const discard = () => {
    store.set(key, null);
    setRestored(null);
    setLines(saved);
    setWords(null);
    setCursor(firstUntimed(saved));
    setError("");
    setStep(startStep(saved));
  };

  const steps: { id: Step; label: string; open: boolean; done: boolean }[] = [
    { id: "words", label: "Words", open: true, done: lines.length > 0 },
    { id: "time", label: "Timing", open: lines.length > 0 && words === null, done: allTimed },
    { id: "translate", label: "Translations", open: allTimed && words === null, done: p.translated > 0 },
  ];

  return (
    <>
      <PageHeader
        title={`Time lyrics: ${view.title}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/releases/${releaseId}`} className="text-primary hover:underline">
              {release?.title ?? "Back to the release"}
            </Link>
            <Link href={`/releases/${releaseId}/tracks/${view.trackId}/lyrics`} className="text-primary hover:underline">
              Edit as text
            </Link>
          </span>
        }
        actions={
          <>
            <span className="text-sm text-muted" role="status">
              {changed ? (kept ? "Not saved yet · kept in this browser" : "Not saved yet · stay on this page") : view.lyrics ? "Saved" : ""}
            </span>
            {changed && (
              <Button onClick={() => setDiscarding(true)} disabled={busy}>
                Discard changes
              </Button>
            )}
            <Button variant="primary" onClick={() => void save()} disabled={!canSave} title={!allTimed ? "Time every line first" : problems.size ? "Fix the times marked in red first" : undefined}>
              {busy ? "Saving…" : "Save lyrics"}
            </Button>
          </>
        }
      />

      <div className="mx-auto max-w-4xl space-y-4">
        <nav aria-label="Steps" className="grid grid-cols-3 gap-2">
          {steps.map((s, i) => (
            <button key={s.id} type="button" disabled={!s.open} aria-current={step === s.id ? "step" : undefined} onClick={() => go(s.id)} className={cx("rounded-control border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-faint", step === s.id ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-panel hover:bg-sunken")}>
              {s.done && step !== s.id ? "✓ " : `${i + 1}. `}
              {s.label}
            </button>
          ))}
        </nav>

        {restored && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink">
            <span className="flex-1">
              Your unfinished work from {fmtDateTime(new Date(restored.savedAt).toISOString())} is back.
              {restored.base !== editable(first.lyrics) && " The saved lyrics have changed since then: saving will replace them."}
            </span>
            <Button small onClick={() => setRestored(null)}>
              Keep it
            </Button>
            <Button small onClick={() => setDiscarding(true)}>
              Discard it
            </Button>
          </div>
        )}
        {error && <ErrorBox error={error} />}
        {track?.visibility === "public" && changed && allTimed && <p className="text-sm text-muted">This song is public: saving changes what listeners see right away.</p>}

        {step === "words" && (
          <Card title="Paste the words">
            <p className="mb-3 text-sm text-muted">
              One line for each line as it is sung. Empty lines are ignored, and headings such as [Chorus] are left out. Write <strong>♪</strong> on its own line for a music break, or add breaks while timing. Write every repeat of a chorus each time it is sung.
            </p>
            <label htmlFor={wordsId} className="sr-only">
              Words of the song
            </label>
            <Textarea id={wordsId} rows={16} value={typed} spellCheck={false} placeholder={"Paste the lyrics here"} onChange={(e) => setWords(e.target.value)} />
            {parsed?.error && <p className="mt-2 text-sm text-danger-ink">{parsed.error}</p>}
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-sm text-muted">
                {parsed && !parsed.error ? `${parsed.lines.length} line${parsed.lines.length === 1 ? "" : "s"}${parsed.dropped ? ` · ${parsed.dropped} heading${parsed.dropped === 1 ? "" : "s"} left out` : ""}${lines.length && words !== null ? ` · ${progress(parsed.lines).timed} keep their time` : ""}` : ""}
              </span>
              {words !== null && lines.length > 0 && <Button onClick={() => setWords(null)}>Undo word changes</Button>}
              <Button variant="primary" disabled={!parsed || !!parsed.error || parsed.lines.length === 0} onClick={useWords}>
                Continue
              </Button>
            </div>
          </Card>
        )}

        {step === "time" && (
          <>
            {allTimed && (
              <div className="flex flex-wrap items-center gap-2 rounded-card border border-success/40 bg-success/10 px-4 py-3">
                <div className="w-full">
                  <p className="font-semibold">{problems.size ? "Every line has a time, but some need fixing (marked in red)." : "All lines are timed. Do you want to add English translations?"}</p>
                  <p className="text-sm text-muted">Play from the start to check them. Translations can also be added later.</p>
                </div>
                <Button onClick={() => (song.seek(0), song.play())} disabled={song.status !== "ready"}>
                  Play from start
                </Button>
                {!problems.size && changed && (
                  <Button onClick={() => void save()} disabled={!canSave}>
                    Save without adding now
                  </Button>
                )}
                {!problems.size && (
                  <Button variant="primary" onClick={() => go("translate")}>
                    Add translations
                  </Button>
                )}
              </div>
            )}
            <TimingStep lines={lines} setLines={setLines} song={song} durationMs={view.durationMs} cursor={cursor} setCursor={setCursor} />
          </>
        )}

        {step === "translate" && (
          <>
            {!changed && view.lyrics && <p className="text-sm text-muted">The times are saved. Add or change translations here whenever you like, then save.</p>}
            <TranslationStep lines={lines} setLines={setLines} song={song} />
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => void save()} disabled={!canSave}>
                {busy ? "Saving…" : "Save lyrics"}
              </Button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={discarding}
        title="Discard your unsaved work?"
        description={view.lyrics ? "The tool goes back to the saved lyrics. The words, times and translations you have not saved are lost." : "The words, times and translations you have not saved are lost."}
        confirmLabel="Discard"
        onClose={() => setDiscarding(false)}
        onConfirm={async () => discard()}
      />
    </>
  );
}
