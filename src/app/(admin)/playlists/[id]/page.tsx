"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { CoverUpload } from "@/components/CoverUpload";
import { ReasonDialog } from "@/components/Dialogs";
import { IArrowDown, IArrowUp, IGrip, IPlaylist, IPlay, IPlus, ISearch, ITrash } from "@/components/icons";
import { useContextMenu } from "@/components/menu";
import { usePageTitle } from "@/components/page-meta";
import { PlayButton, usePlayer } from "@/components/Player";
import { SectionsCard } from "@/components/SectionsCard";
import { useToast } from "@/components/Shell";
import { Badge, Button, Empty, ErrorBox, Field, IconButton, Input, Loading, SearchField, Textarea } from "@/components/ui";
import { InspectorSection, Workspace } from "@/components/Workspace";
import { api, ApiError } from "@/lib/api";
import { editorialMessage } from "@/lib/editorial";
import { fmtDuration } from "@/lib/format";
import { move } from "@/lib/list";
import type { PlaylistDetail, PlaylistItem, SearchTrack } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

/** What the editor holds for one row: enough to show it before the server has seen the change. */
interface Row {
  key: string;
  trackId: string;
  title: string;
  artistName: string;
  durationMs: number;
  public: boolean;
}

const toRow = (i: PlaylistItem): Row => ({ key: i.itemId, trackId: i.trackId, title: i.title, artistName: i.artistName, durationMs: i.durationMs, public: i.public });

function TrackPicker({ onAdd }: { onAdd: (t: SearchTrack & { id: string }) => void }) {
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim());
  const res = useApi<{ tracks: SearchTrack[] }>(term.length >= 2 ? `/api/search?q=${encodeURIComponent(term)}&limit=20` : null);
  return (
    <div>
      <SearchField aria-label="Search for a track" value={q} placeholder="Search tracks…" onChange={(e) => setQ(e.target.value)} />
      <div className="mt-2">
        {term.length < 2 && <p className="py-6 text-center text-xs text-muted">Type at least two letters to find tracks to add.</p>}
        {term.length >= 2 && res.loading && !res.data && <Loading rows={3} />}
        {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
        {res.data && res.data.tracks.length === 0 && <p className="py-6 text-center text-xs text-muted">No tracks found.</p>}
        <ul className="-mx-1 divide-y divide-line">
          {res.data?.tracks
            .filter((t): t is SearchTrack & { id: string } => !!t.id)
            .map((t) => (
              <li key={t.id} className="flex items-center gap-1 px-1 py-1.5">
                <PlayButton track={{ id: t.id, title: t.title, artist: t.artistName }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.title}</div>
                  <div className="truncate text-[11px] text-muted">
                    {t.artistName}
                    {t.albumTitle ? ` · ${t.albumTitle}` : ""}
                  </div>
                </div>
                <IconButton small label={`Add ${t.title}`} variant="secondary" onClick={() => onAdd(t)}>
                  <IPlus size={14} />
                </IconButton>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

function TrackRow({
  r,
  i,
  last,
  dragging,
  onMove,
  onRemove,
  onDragStart,
  onDrop,
  onDragEnd,
}: {
  r: Row;
  i: number;
  last: boolean;
  dragging: boolean;
  onMove: (to: number) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const player = usePlayer();
  const { bind, menu } = useContextMenu([
    { label: "Play", icon: <IPlay />, disabled: !r.public, onSelect: () => player.play({ id: r.trackId, title: r.title, artist: r.artistName }) },
    { label: "Move up", icon: <IArrowUp />, disabled: i === 0, onSelect: () => onMove(i - 1), separated: true },
    { label: "Move down", icon: <IArrowDown />, disabled: last, onSelect: () => onMove(i + 1) },
    { label: "Remove from playlist", icon: <ITrash />, danger: true, onSelect: onRemove, separated: true },
  ]);
  return (
    <li
      {...bind}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-sunken/60 ${dragging ? "opacity-40" : ""} ${player.current?.id === r.trackId ? "bg-primary-soft/60" : ""}`}
    >
      <span className="cursor-grab text-faint group-hover:text-muted" title="Drag to reorder">
        <IGrip size={15} />
      </span>
      <span className="w-5 text-right text-xs tabular-nums text-faint">{i + 1}</span>
      <PlayButton track={{ id: r.trackId, title: r.title, artist: r.artistName }} disabled={!r.public} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 truncate font-medium">
          <span className="truncate">{r.title}</span>
          {!r.public && <Badge tone="amber">Not public</Badge>}
        </div>
        <div className="truncate text-[11px] text-muted">{r.artistName}</div>
      </div>
      <span className="text-xs tabular-nums text-muted">{fmtDuration(r.durationMs)}</span>
      <div className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <IconButton small label={`Move ${r.title} up`} disabled={i === 0} onClick={() => onMove(i - 1)}>
          <IArrowUp size={14} />
        </IconButton>
        <IconButton small label={`Move ${r.title} down`} disabled={last} onClick={() => onMove(i + 1)}>
          <IArrowDown size={14} />
        </IconButton>
        <IconButton small label={`Remove ${r.title}`} onClick={onRemove}>
          <ITrash size={14} />
        </IconButton>
      </div>
      {menu}
    </li>
  );
}

function Editor({ p, id, reload }: { p: PlaylistDetail; id: string; reload: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(() => p.items.map(toRow));
  const [name, setName] = useState(p.name);
  const [description, setDescription] = useState(p.description);
  const [saving, setSaving] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dlg, setDlg] = useState<"delete" | "unpublish" | null>(null);
  const idN = useId();
  const idD = useId();

  const serverIds = useMemo(() => p.items.map((i) => i.trackId).join("|"), [p]);
  const orderDirty = rows.map((r) => r.trackId).join("|") !== serverIds;
  const metaDirty = name.trim() !== p.name || description !== p.description;
  const published = p.published ?? p.isPublic;
  const publicCount = rows.filter((r) => r.public).length;
  const totalMs = rows.reduce((s, r) => s + r.durationMs, 0);

  async function saveTracks() {
    setSaving(true);
    try {
      await api(`/playlists/${id}/items`, { method: "PUT", body: { trackIds: rows.map((r) => r.trackId) } });
      toast("Track list saved");
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not save the track list.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveMeta() {
    setSaving(true);
    try {
      await api(`/playlists/${id}`, { method: "PATCH", body: { name: name.trim(), description } });
      toast("Details saved");
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not save.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (orderDirty) {
      toast("Save the track list before publishing.", "error");
      return;
    }
    try {
      await api(`/playlists/${id}/publish`, { method: "POST" });
      toast("Playlist published");
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? (e.code === "no_public_track" ? "Add at least one public track before publishing." : e.message) : "Could not publish.", "error");
    }
  }

  return (
    <>
      <Workspace
        leftTitle="Library"
        left={<TrackPicker onAdd={(t) => setRows((c) => [...c, { key: `new-${t.id}-${c.length}`, trackId: t.id, title: t.title, artistName: t.artistName ?? "", durationMs: t.durationMs, public: true }])} />}
        rightTitle="Inspector"
        right={
          <>
            <InspectorSection title="Cover">
              <CoverUpload target={`/playlists/${id}`} coverUrl={p.coverUrl} onChanged={reload} />
              {!p.coverUrl && <p className="mt-3 text-[11px] text-warning-ink">Every editorial playlist needs a cover before it goes live in the app.</p>}
            </InspectorSection>
            <InspectorSection title="Details">
              <div className="space-y-3">
                <Field label="Name" htmlFor={idN}>
                  <Input id={idN} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Description" htmlFor={idD}>
                  <Textarea id={idD} rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
                </Field>
                <Button variant="primary" small disabled={!metaDirty || saving || !name.trim()} onClick={saveMeta}>
                  Save details
                </Button>
              </div>
            </InspectorSection>
            <InspectorSection title="Sections">
              <SectionsCard playlistId={id} onChanged={reload} />
            </InspectorSection>
            <InspectorSection title="Summary" defaultOpen={false}>
              <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
                <dt className="text-muted">Tracks</dt>
                <dd>{rows.length}</dd>
                <dt className="text-muted">Playable</dt>
                <dd>{publicCount}</dd>
                <dt className="text-muted">Length</dt>
                <dd className="tabular-nums">{fmtDuration(totalMs)}</dd>
              </dl>
            </InspectorSection>
          </>
        }
        header={
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight">{p.name}</h1>
                {published ? <Badge tone="green">Published</Badge> : <Badge>Unpublished</Badge>}
                {orderDirty && <Badge tone="amber">Unsaved changes</Badge>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                {p.groups && p.groups.length > 0 ? (
                  <>
                    In sections:
                    {p.groups.map((g) => (
                      <Link key={g.id} href={`/sections/${g.id}`}>
                        <Badge tone="blue">{g.title}</Badge>
                      </Link>
                    ))}
                  </>
                ) : (
                  "Not in any section yet"
                )}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {published ? (
                <Button onClick={() => setDlg("unpublish")}>Unpublish</Button>
              ) : (
                <Button variant="primary" onClick={publish}>
                  Publish
                </Button>
              )}
              <Button variant="ghost" className="text-danger-ink hover:bg-danger/10 hover:text-danger-ink" onClick={() => setDlg("delete")}>
                <ITrash size={14} /> Delete
              </Button>
            </div>
          </div>
        }
      >
        <div className="rounded-card border border-line bg-panel">
          <div className="flex h-11 items-center justify-between gap-3 border-b border-line px-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <IPlaylist size={16} className="text-muted" /> Tracks
              <span className="text-xs font-normal text-muted">
                {rows.length} · {fmtDuration(totalMs)}
              </span>
            </h2>
            <Button variant="primary" small disabled={!orderDirty || saving} onClick={saveTracks}>
              {saving ? "Saving…" : orderDirty ? "Save track list" : "Saved"}
            </Button>
          </div>
          {rows.length === 0 ? (
            <div className="p-4">
              <Empty icon={<ISearch size={20} />}>No tracks yet. Search the library on the left and add some.</Empty>
            </div>
          ) : (
            <ol className="divide-y divide-line py-1">
              {rows.map((r, i) => (
                <TrackRow
                  key={`${r.key}-${i}`}
                  r={r}
                  i={i}
                  last={i === rows.length - 1}
                  dragging={dragFrom === i}
                  onMove={(to) => setRows((c) => move(c, i, to))}
                  onRemove={() => setRows((c) => c.filter((_, k) => k !== i))}
                  onDragStart={() => setDragFrom(i)}
                  onDrop={() => {
                    if (dragFrom !== null) setRows((cur) => move(cur, dragFrom, i));
                    setDragFrom(null);
                  }}
                  onDragEnd={() => setDragFrom(null)}
                />
              ))}
            </ol>
          )}
        </div>
        {rows.length > 0 && publicCount === 0 && <p className="mt-3 text-sm text-warning-ink">None of these tracks is public, so the playlist cannot be published yet.</p>}
      </Workspace>

      <ReasonDialog
        open={dlg === "unpublish"}
        title={`Unpublish "${p.name}"?`}
        description="It disappears from Browse and Home shelves for listeners. You can publish it again later."
        confirmLabel="Unpublish"
        reasonLabel="Note"
        required={false}
        onClose={() => setDlg(null)}
        onSubmit={async () => {
          await api(`/playlists/${id}/unpublish`, { method: "POST" });
          toast("Playlist unpublished");
          reload();
        }}
      />
      <ReasonDialog
        open={dlg === "delete"}
        title={`Delete "${p.name}"?`}
        description={`The playlist and its track list (${p.trackCount} track${p.trackCount === 1 ? "" : "s"}) are removed permanently. The tracks themselves are not touched.`}
        confirmLabel="Delete playlist"
        danger
        onClose={() => setDlg(null)}
        onSubmit={async () => {
          await api(`/playlists/${id}`, { method: "DELETE" });
          toast("Playlist deleted");
          router.replace("/playlists");
        }}
      />
    </>
  );
}

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<PlaylistDetail>(`/playlists/${id}`);
  const p = q.data;
  usePageTitle(p?.name, "playlist");
  if (q.error) return <div className="p-5"><ErrorBox error={editorialMessage(q.error.code) ?? q.error} onRetry={q.reload} /></div>;
  if (!p) return <div className="p-5"><Loading /></div>;
  // The editor remounts with fresh state whenever the saved playlist changes.
  const sig = `${p.name}|${p.description}|${p.published ?? p.isPublic}|${p.items.map((i) => i.trackId).join(",")}`;
  return <Editor key={sig} p={p} id={id} reload={q.reload} />;
}
