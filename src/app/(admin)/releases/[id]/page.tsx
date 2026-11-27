"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useId, useState } from "react";
import { VisibilityBadge } from "@/components/badges";
import { CoverUpload } from "@/components/CoverUpload";
import { FeaturedArtistsCard } from "@/components/FeaturedArtists";
import { MakeSingleDialog } from "@/components/MakeSingle";
import { TrackMetadataCard } from "@/components/TrackMetadataCard";
import { canFeature, featureError } from "@/lib/featured";
import { DeleteDialog, Modal, ReasonDialog } from "@/components/Dialogs";
import { IArrowDown, IArrowUp, IBan, IMore, IStar, ITrash } from "@/components/icons";
import { Menu } from "@/components/menu";
import { usePageTitle } from "@/components/page-meta";
import { PlayButton } from "@/components/Player";
import { useToast } from "@/components/Shell";
import { TrackUploader } from "@/components/TrackUploader";
import { Badge, Button, Card, ErrorBox, Field, IconButton, Input, KV, Loading, PageHeader, Select, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fmtBytes, fmtDate, fmtDateTime, fmtDuration } from "@/lib/format";
import { usableGenre } from "@/lib/taxonomy";
import type { GenreList, ReleaseDeletionPreview, ReleaseDetail, TrackRow } from "@/lib/types";
import { useApi } from "@/lib/useApi";

function EditForm({ r, onSaved }: { r: ReleaseDetail; onSaved: () => void }) {
  const toast = useToast();
  const genres = useApi<GenreList>("/api/genres");
  const [title, setTitle] = useState(r.title);
  const [description, setDescription] = useState(r.description);
  const [genre, setGenre] = useState(r.genre);
  const [type, setType] = useState(r.type);
  const [date, setDate] = useState(r.releaseDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = [useId(), useId(), useId(), useId(), useId()];
  const dirty = title.trim() !== r.title || description !== r.description || genre !== r.genre || type !== r.type || date !== (r.releaseDate ?? "");
  const names = (genres.data?.genres ?? []).map((g) => g.name);
  const options = genre && !names.some((n) => n.toLowerCase() === genre.toLowerCase()) ? [genre, ...names] : names;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api(`/releases/${r.id}`, { method: "PATCH", body: { title: title.trim(), description, genre, releaseType: type, releaseDate: date } });
          toast("Release saved");
          onSaved();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Title" htmlFor={ids[0]!}>
        <Input id={ids[0]} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Genre" htmlFor={ids[1]!}>
          <Select id={ids[1]} className="w-full" value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="">None</option>
            {options.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type" htmlFor={ids[2]!}>
          <Select id={ids[2]} className="w-full" value={type} onChange={(e) => setType(e.target.value as "single" | "album")}>
            <option value="single">Single</option>
            <option value="album">Album</option>
          </Select>
        </Field>
        <Field label="Release date" htmlFor={ids[3]!}>
          <Input id={ids[3]} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Description" htmlFor={ids[4]!}>
        <Textarea id={ids[4]} rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {error && <ErrorBox error={error} />}
      <Button type="submit" variant="primary" disabled={!dirty || busy || title.trim().length < 1}>
        {busy ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

function TrackEditor({ t, releaseId, artist, first, last, onMove, onChanged, onSingle }: { t: TrackRow; releaseId: string; artist: string; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void; onChanged: () => void; onSingle?: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(t.title);
  const [explicit, setExplicit] = useState(t.explicit);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const dirty = title.trim() !== t.title || explicit !== t.explicit;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <span className="w-5 shrink-0 text-sm tabular-nums text-muted">{t.trackNumber ?? ""}</span>
      <PlayButton track={{ id: t.id, title: t.title, artist }} disabled={t.visibility !== "public"} />
      <Input className="min-w-40 flex-1 basis-48" aria-label={`Title of track ${t.trackNumber ?? ""}`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      <span className="whitespace-nowrap text-sm tabular-nums text-muted">{fmtDuration(t.durationMs)}</span>
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" className="accent-primary" checked={explicit} onChange={(e) => setExplicit(e.target.checked)} /> Explicit
      </label>
      <div className="ml-auto flex items-center gap-1">
        <IconButton small label={`Move ${t.title} up`} disabled={first} onClick={() => onMove(-1)}>
          <IArrowUp size={14} />
        </IconButton>
        <IconButton small label={`Move ${t.title} down`} disabled={last} onClick={() => onMove(1)}>
          <IArrowDown size={14} />
        </IconButton>
        <Button
          small
          variant="primary"
          disabled={!dirty || busy || title.trim().length < 1}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/tracks/${t.id}`, { method: "PATCH", body: { title: title.trim(), explicit } });
              toast("Track saved");
              onChanged();
            } catch (err) {
              toast(err instanceof ApiError ? err.message : "Could not save.", "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
        <Link href={`/releases/${releaseId}/tracks/${t.id}/lyrics`} aria-label={`Lyrics of ${t.title}${t.hasLyrics ? " (added)" : ""}`}>
          <Button small>{t.hasLyrics ? "Lyrics ✓" : "Lyrics"}</Button>
        </Link>
        {onSingle && (
          <Button small onClick={onSingle} aria-label={`Make ${t.title} a single`}>
            Make single
          </Button>
        )}
        <IconButton small label={`Delete ${t.title}`} onClick={() => setDel(true)} className="text-danger-ink hover:bg-danger/10">
          <ITrash size={14} />
        </IconButton>
      </div>
      <ReasonDialog
        open={del}
        title={`Delete track "${t.title}"?`}
        description="The track and its audio file are removed permanently, and it disappears from playlists and libraries."
        confirmLabel="Delete track"
        danger
        onClose={() => setDel(false)}
        onSubmit={async (reason) => {
          await api(`/tracks/${t.id}`, { method: "DELETE", body: { reason } });
          toast("Track deleted");
          onChanged();
        }}
      />
    </li>
  );
}

/** Publish now, or pick a date and time to go live. */
function PublishDialog({ open, r, onClose, onDone }: { open: boolean; r: ReleaseDetail; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={open} title={r.visibility === "scheduled" ? "Change when it goes live" : `Publish "${r.title}"`} onClose={onClose}>
      {open && <PublishForm r={r} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function PublishForm({ r, onClose, onDone }: { r: ReleaseDetail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"now" | "later">("now");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idW = useId();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || (mode === "later" && !when)) return;
        if (mode === "later" && new Date(when).getTime() <= Date.now()) {
          setError("Pick a time in the future.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          await api(`/releases/${r.id}/publish`, { method: "POST", body: mode === "later" ? { publishAt: new Date(when).toISOString() } : {} });
          toast(mode === "later" ? "Release scheduled" : "Release published");
          onDone();
          onClose();
        } catch (err) {
          setError(err instanceof ApiError ? (err.code === "no_tracks" ? "Add at least one track before publishing." : err.code === "uploads_pending" ? "A file is still uploading or being processed. Publish once it has finished." : err.message) : "Could not publish.");
          setBusy(false);
        }
      }}
    >
      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-2">
          <input type="radio" className="mt-1 accent-primary" name="when" checked={mode === "now"} onChange={() => setMode("now")} />
          <span>
            <span className="font-medium">Publish now</span>
            <span className="block text-xs text-muted">Listeners can find it right away.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" className="mt-1 accent-primary" name="when" checked={mode === "later"} onChange={() => setMode("later")} />
          <span className="flex-1">
            <span className="font-medium">Schedule</span>
            <span className="block text-xs text-muted">It stays hidden until the date and time you choose.</span>
          </span>
        </label>
        {mode === "later" && (
          <Field label="Goes live at" htmlFor={idW}>
            <Input id={idW} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        )}
      </div>
      {error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy || (mode === "later" && !when)}>
          {busy ? "Working…" : mode === "later" ? "Schedule" : "Publish now"}
        </Button>
      </div>
    </form>
  );
}

export default function ReleasePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const q = useApi<ReleaseDetail>(`/releases/${id}`);
  const genreList = useApi<GenreList>("/api/genres");
  const [dlg, setDlg] = useState<"takedown" | "restore" | "delete" | "publish" | "unpublish" | null>(null);
  const [moving, setMoving] = useState(false);
  const [single, setSingle] = useState<TrackRow | null>(null);
  const [guestChanges, setGuestChanges] = useState(0);
  const r = q.data;
  usePageTitle(r?.title, "release");
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!r) return <Loading />;

  const tracks = [...r.tracks].sort((a, b) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999));
  const live = r.visibility === "public" || r.visibility === "scheduled";

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= tracks.length) return;
    const order = [...tracks];
    [order[i], order[j]] = [order[j]!, order[i]!];
    setMoving(true);
    try {
      for (const [k, t] of order.entries()) {
        if (t.trackNumber !== k + 1) await api(`/tracks/${t.id}`, { method: "PATCH", body: { trackNumber: k + 1 } });
      }
      q.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not reorder the tracks.", "error");
    } finally {
      setMoving(false);
    }
  }

  return (
    <>
      <PageHeader
        title={r.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/artists/${r.artistId}`} className="hover:underline">
              {r.artistName}
            </Link>
            <VisibilityBadge v={r.visibility} takenDown={r.takenDown} />
            <Badge>{r.kind ?? r.type}</Badge>
            {r.visibility === "scheduled" && r.publishAt && <span className="text-xs">goes live {fmtDateTime(r.publishAt)}</span>}
          </span>
        }
        actions={
          <>
            {!r.takenDown && (live ? <Button onClick={() => setDlg("unpublish")}>Unpublish</Button> : null)}
            {!r.takenDown && r.visibility !== "public" && (
              <Button variant="primary" disabled={tracks.length === 0} title={tracks.length === 0 ? "Add at least one track first" : undefined} onClick={() => setDlg("publish")}>
                {r.visibility === "scheduled" ? "Reschedule" : "Publish"}
              </Button>
            )}
            {r.takenDown && (
              <Button onClick={() => setDlg("restore")} disabled={r.takedown?.byBan}>
                Restore
              </Button>
            )}
            {(canFeature(r) || r.featured) && (
              <Button
                aria-pressed={!!r.featured}
                onClick={async () => {
                  try {
                    await api(`/releases/${r.id}/featured`, { method: r.featured ? "DELETE" : "PUT" });
                    toast(r.featured ? "Removed from featured" : "Featured");
                  } catch (e) {
                    toast(e instanceof ApiError ? featureError(e.code, e.message) : "Could not save.", "error");
                  }
                  q.reload();
                }}
              >
                <IStar size={14} fill={r.featured ? "currentColor" : "none"} /> {r.featured ? "Unfeature" : "Feature"}
              </Button>
            )}
            <Menu
              items={[
                ...(!r.takenDown ? [{ label: "Take down", icon: <IBan />, danger: true, onSelect: () => setDlg("takedown") }] : []),
                { label: "Delete release", icon: <ITrash />, danger: true, separated: !r.takenDown, onSelect: () => setDlg("delete") },
              ]}
              trigger={({ props }) => (
                <button {...props} aria-label="More release actions" className="inline-flex size-8 items-center justify-center rounded-control border border-line bg-panel text-muted hover:bg-sunken hover:text-ink">
                  <IMore size={16} />
                </button>
              )}
            />
          </>
        }
      />
      {r.takenDown && (
        <div role="status" className="mb-4 rounded-control border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger-ink">
          <strong>Taken down</strong> on {fmtDateTime(r.takedown?.at)}{r.takedown?.byBan ? " because its artist or owner was banned" : r.takedown?.by ? ` by ${r.takedown.by.email}` : ""}. Reason: {r.takedown?.reason}. It was {r.takedown?.previousVisibility ?? "public"} before. It is hidden from listeners and the artist cannot republish it until you restore it.{r.takedown?.byBan && " To bring it back, unban the artist or user."}
        </div>
      )}
      {!r.takenDown && r.visibility === "draft" && (
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-control border border-line bg-panel px-4 py-2.5 text-sm">
          <span className="font-medium">Before you publish</span>
          <span className={tracks.length > 0 ? "text-success-ink" : "text-muted"}>{tracks.length > 0 ? "✓" : "○"} Tracks added ({tracks.length})</span>
          <span className={r.coverUrl ? "text-success-ink" : "text-muted"}>{r.coverUrl ? "✓" : "○"} Cover art</span>
          <span className={r.genre ? "text-success-ink" : "text-muted"}>{r.genre ? "✓" : "○"} Genre</span>
        </div>
      )}

      <div className="space-y-4">
        <Card title="Cover art and facts">
          <div className="grid gap-5 md:grid-cols-2">
            <CoverUpload target={`/releases/${r.id}`} coverUrl={r.coverUrl} label="Cover" onChanged={q.reload} />
            <div className="border-t border-line pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
              <KV
                items={[
                  ["Created", fmtDate(r.createdAt)],
                  ["Release date", fmtDate(r.releaseDate)],
                  ["Published", fmtDate(r.publishedAt)],
                  ["Tracks", tracks.length],
                  ["Release id", <code key="i" className="break-all text-xs">{r.id}</code>],
                ]}
              />
            </div>
          </div>
        </Card>
        <Card title="Details">
          <EditForm key={`${r.title}|${r.description}|${r.genre}|${r.type}|${r.releaseDate ?? ""}`} r={r} onSaved={q.reload} />
        </Card>
        <Card title={`Tracks (${tracks.length})`} className={moving ? "opacity-70" : undefined}>
          {tracks.length === 0 ? (
            <p className="text-sm text-muted">No tracks yet. Add the audio below.</p>
          ) : (
            <ul className="divide-y divide-line">
              {tracks.map((t, i) => (
                <TrackEditor key={`${t.id}|${t.title}|${t.explicit}|${t.trackNumber}`} t={t} releaseId={r.id} artist={r.artistName} first={i === 0} last={i === tracks.length - 1} onMove={(d) => void move(i, d)} onChanged={q.reload} onSingle={r.type === "album" && !r.takenDown && !r.artist?.banned ? () => setSingle(t) : undefined} />
              ))}
            </ul>
          )}
        </Card>
        <FeaturedArtistsCard key={tracks.map((t) => `${t.id}:${t.trackNumber}:${t.title}`).join("|")} releaseId={r.id} mainArtistId={r.artistId} onChanged={() => setGuestChanges((n) => n + 1)} />
        <TrackMetadataCard releaseId={r.id} trackKey={`${guestChanges}|${tracks.map((t) => `${t.id}:${t.trackNumber}:${t.title}`).join("|")}`} />
        {!r.takenDown && (
          <Card title="Add tracks">
            {r.genre && !usableGenre(r.genre, genreList.data?.genres) && <p className="mb-3 text-sm text-muted">The genre {r.genre} is switched off, so songs added now get no genre. Choose another under Details to give them one.</p>}
            <TrackUploader releaseId={r.id} nextTrackNumber={tracks.length + 1} genre={usableGenre(r.genre, genreList.data?.genres) || undefined} pending={r.uploads ?? []} onChanged={q.reload} />
          </Card>
        )}
      </div>

      <MakeSingleDialog
        track={single}
        from={r}
        onClose={() => setSingle(null)}
        onDone={(releaseId) => {
          setSingle(null);
          toast("Single created");
          router.push(`/releases/${releaseId}`);
        }}
      />
      <PublishDialog open={dlg === "publish"} r={r} onClose={() => setDlg(null)} onDone={q.reload} />
      <ReasonDialog
        open={dlg === "unpublish"}
        title={`Unpublish "${r.title}"?`}
        description="It goes back to a draft and disappears for listeners. You can publish it again later."
        confirmLabel="Unpublish"
        reasonLabel="Note"
        required={false}
        onClose={() => setDlg(null)}
        onSubmit={async () => {
          await api(`/releases/${r.id}/unpublish`, { method: "POST" });
          toast("Release is a draft again");
          q.reload();
        }}
      />
      <ReasonDialog
        open={dlg === "takedown"}
        title={`Take down "${r.title}"?`}
        description="It is hidden from listeners right away. The artist sees that it was taken down and cannot republish it. You can restore it later."
        confirmLabel="Take down"
        danger
        onClose={() => setDlg(null)}
        onSubmit={async (reason) => {
          await api(`/releases/${r.id}/takedown`, { method: "POST", body: { reason } });
          toast("Release taken down");
          q.reload();
        }}
      />
      <ReasonDialog
        open={dlg === "restore"}
        title={`Restore "${r.title}"?`}
        description="It goes back to the state it had before the takedown."
        confirmLabel="Restore"
        reasonLabel="Note"
        required={false}
        onClose={() => setDlg(null)}
        onSubmit={async (note) => {
          await api(`/releases/${r.id}/restore`, { method: "POST", body: { note } });
          toast("Release restored");
          q.reload();
        }}
      />
      <DeleteDialog<ReleaseDeletionPreview>
        open={dlg === "delete"}
        title={`Delete "${r.title}"?`}
        previewPath={`/releases/${r.id}/deletion-preview`}
        describe={(p) => [
          `The release "${r.title}" by ${r.artistName}`,
          `${p.tracks} track${p.tracks === 1 ? "" : "s"} and ${p.files} stored file${p.files === 1 ? "" : "s"} (${fmtBytes(p.storageBytes)} freed for the artist)`,
          `${p.libraryReferences} saved library item${p.libraryReferences === 1 ? "" : "s"} and its place in ${p.playlistReferences} playlist${p.playlistReferences === 1 ? "" : "s"}`,
        ]}
        confirmValue={r.title}
        confirmHint={`Type ${r.title} to confirm`}
        onClose={() => setDlg(null)}
        onDelete={async (reason) => {
          await api(`/releases/${r.id}`, { method: "DELETE", body: { reason } });
          toast("Release deleted");
          router.replace("/releases");
        }}
      />
    </>
  );
}
