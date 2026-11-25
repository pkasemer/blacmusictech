"use client";

import { useParams, useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { ReasonDialog } from "@/components/Dialogs";
import { useToast } from "@/components/Shell";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
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
  const res = useApi<{ tracks: SearchTrack[] }>(term.length >= 2 ? `/api/search?q=${encodeURIComponent(term)}&limit=15` : null);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        Add tracks
      </label>
      <Input id={id} value={q} placeholder="Search for a track" onChange={(e) => setQ(e.target.value)} />
      <div className="mt-2 max-h-72 overflow-y-auto">
        {term.length >= 2 && res.loading && !res.data && <p className="py-3 text-sm text-muted">Searching…</p>}
        {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
        {res.data && res.data.tracks.length === 0 && <p className="py-3 text-sm text-muted">No tracks found.</p>}
        <ul className="divide-y divide-line">
          {res.data?.tracks
            .filter((t): t is SearchTrack & { id: string } => !!t.id)
            .map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="truncate text-xs text-muted">
                    {t.artistName}
                    {t.albumTitle ? ` · ${t.albumTitle}` : ""}
                  </div>
                </div>
                <Button small onClick={() => onAdd(t)}>
                  Add
                </Button>
              </li>
            ))}
        </ul>
      </div>
    </div>
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

  const publicCount = rows.filter((r) => r.public).length;

  return (
    <>
      <PageHeader
        back={{ href: "/playlists", label: "Playlists" }}
        title={p.name}
        subtitle={<span className="flex items-center gap-2">{p.isPublic ? <Badge tone="green">Published</Badge> : <Badge>Unpublished</Badge>}{p.groups && p.groups.length > 0 && <span>On Home: {p.groups.join(", ")}</span>}</span>}
        actions={
          <>
            {p.isPublic ? (
              <Button onClick={() => setDlg("unpublish")}>Unpublish</Button>
            ) : (
              <Button variant="primary" onClick={publish}>
                Publish
              </Button>
            )}
            <Button variant="danger" onClick={() => setDlg("delete")}>
              Delete
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Card
            title={`Tracks (${rows.length})`}
            actions={
              <Button variant="primary" small disabled={!orderDirty || saving} onClick={saveTracks}>
                {saving ? "Saving…" : orderDirty ? "Save track list" : "Saved"}
              </Button>
            }
          >
            {rows.length === 0 ? (
              <p className="text-sm text-muted">No tracks yet. Search on the right and add some.</p>
            ) : (
              <ol className="divide-y divide-line">
                {rows.map((r, i) => (
                  <li
                    key={`${r.key}-${i}`}
                    draggable
                    onDragStart={() => setDragFrom(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragFrom !== null) setRows((cur) => move(cur, dragFrom, i));
                      setDragFrom(null);
                    }}
                    onDragEnd={() => setDragFrom(null)}
                    className={`flex items-center gap-3 py-2 text-sm ${dragFrom === i ? "opacity-40" : ""}`}
                  >
                    <span className="w-6 cursor-grab select-none text-center text-muted" aria-hidden="true" title="Drag to reorder">
                      ⠿
                    </span>
                    <span className="w-6 tabular-nums text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {r.title} {!r.public && <Badge tone="amber">Not public</Badge>}
                      </div>
                      <div className="truncate text-xs text-muted">{r.artistName}</div>
                    </div>
                    <span className="tabular-nums text-muted">{fmtDuration(r.durationMs)}</span>
                    <div className="flex gap-1">
                      <Button small variant="ghost" aria-label={`Move ${r.title} up`} disabled={i === 0} onClick={() => setRows((c) => move(c, i, i - 1))}>
                        ↑
                      </Button>
                      <Button small variant="ghost" aria-label={`Move ${r.title} down`} disabled={i === rows.length - 1} onClick={() => setRows((c) => move(c, i, i + 1))}>
                        ↓
                      </Button>
                      <Button small variant="ghost" aria-label={`Remove ${r.title}`} onClick={() => setRows((c) => c.filter((_, k) => k !== i))}>
                        ✕
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {rows.length > 0 && publicCount === 0 && <p className="mt-3 text-sm text-amber-800">None of these tracks is public, so the playlist cannot be published yet.</p>}
          </Card>
          <Card title="Details">
            <div className="space-y-4">
              <Field label="Name" htmlFor={idN}>
                <Input id={idN} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Description" htmlFor={idD}>
                <Textarea id={idD} rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <Button variant="primary" disabled={!metaDirty || saving || !name.trim()} onClick={saveMeta}>
                Save details
              </Button>
            </div>
          </Card>
        </div>
        <Card title="Find tracks">
          <TrackPicker
            onAdd={(t) =>
              setRows((c) => [...c, { key: `new-${t.id}-${c.length}`, trackId: t.id, title: t.title, artistName: t.artistName ?? "", durationMs: t.durationMs, public: true }])
            }
          />
        </Card>
      </div>

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
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!p) return <Loading />;
  // The editor remounts with fresh state whenever the saved playlist changes.
  const sig = `${p.updatedAt}|${p.name}|${p.isPublic}|${p.items.map((i) => i.trackId).join(",")}`;
  return <Editor key={sig} p={p} id={id} reload={q.reload} />;
}
