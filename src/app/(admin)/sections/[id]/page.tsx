"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { ConfirmNameDialog } from "@/components/ConfirmDialog";
import { IArrowDown, IArrowUp, IGrip, IPlaylist, IPlus, ITrash } from "@/components/icons";
import { useContextMenu } from "@/components/menu";
import { usePageTitle } from "@/components/page-meta";
import { useToast } from "@/components/Shell";
import { Badge, Button, Empty, ErrorBox, Field, IconButton, Input, Loading, SearchField, Textarea } from "@/components/ui";
import { InspectorSection, Workspace } from "@/components/Workspace";
import { api, ApiError } from "@/lib/api";
import { move } from "@/lib/list";
import type { PlaylistList, PlaylistRow, Section } from "@/lib/types";
import { useApi } from "@/lib/useApi";

function Thumb({ p, size = 36 }: { p?: PlaylistRow; size?: number }) {
  return (
    <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-sunken text-[9px] text-faint" style={{ width: size, height: size }}>
      {p?.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by the API's own media host
        <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <IPlaylist size={size / 2.4} />
      )}
    </div>
  );
}

function MemberRow({
  pid,
  p,
  i,
  last,
  dragging,
  onMove,
  onRemove,
  onDragStart,
  onDrop,
  onDragEnd,
}: {
  pid: string;
  p?: PlaylistRow;
  i: number;
  last: boolean;
  dragging: boolean;
  onMove: (to: number) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const name = p?.name ?? pid;
  const { bind, menu } = useContextMenu([
    { label: "Open playlist", icon: <IPlaylist />, href: p ? `/playlists/${p.id}` : undefined, disabled: !p },
    { label: "Move up", icon: <IArrowUp />, disabled: i === 0, onSelect: () => onMove(i - 1), separated: true },
    { label: "Move down", icon: <IArrowDown />, disabled: last, onSelect: () => onMove(i + 1) },
    { label: "Remove from section", icon: <ITrash />, danger: true, onSelect: onRemove, separated: true },
  ]);
  return (
    <li
      {...bind}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-sunken/60 ${dragging ? "opacity-40" : ""}`}
    >
      <span className="cursor-grab text-faint group-hover:text-muted" title="Drag to reorder">
        <IGrip size={15} />
      </span>
      <span className="w-5 text-right text-xs tabular-nums text-faint">{i + 1}</span>
      <Thumb p={p} />
      <div className="min-w-0 flex-1">
        {p ? (
          <Link href={`/playlists/${p.id}`} className="block truncate font-medium hover:text-primary">
            {name}
          </Link>
        ) : (
          <span className="block truncate font-medium text-muted">{name}</span>
        )}
        <div className="truncate text-[11px] text-muted">
          {p ? `${p.trackCount} track${p.trackCount === 1 ? "" : "s"}` : "Not an editorial playlist"}
          {p && !(p.published ?? p.isPublic) && " · unpublished, so not shown in the app"}
          {p && !p.coverUrl && " · no cover yet"}
        </div>
      </div>
      <div className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <IconButton small label={`Move ${name} up`} disabled={i === 0} onClick={() => onMove(i - 1)}>
          <IArrowUp size={14} />
        </IconButton>
        <IconButton small label={`Move ${name} down`} disabled={last} onClick={() => onMove(i + 1)}>
          <IArrowDown size={14} />
        </IconButton>
        <IconButton small label={`Remove ${name}`} onClick={onRemove}>
          <ITrash size={14} />
        </IconButton>
      </div>
      {menu}
    </li>
  );
}

function Editor({ g, playlists, reload }: { g: Section; playlists: PlaylistRow[]; reload: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const byId = useMemo(() => new Map(playlists.map((p) => [p.id, p])), [playlists]);
  const [ids, setIds] = useState<string[]>(g.playlistIds);
  const [title, setTitle] = useState(g.title);
  const [description, setDescription] = useState(g.description);
  const [isActive, setIsActive] = useState(g.isActive);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const idT = useId();
  const idD = useId();
  const idA = useId();

  const orderDirty = ids.join("|") !== g.playlistIds.join("|");
  const metaDirty = title.trim() !== g.title || description !== g.description || isActive !== g.isActive;
  const candidates = playlists.filter((p) => !ids.includes(p.id) && p.name.toLowerCase().includes(filter.trim().toLowerCase()));

  async function saveOrder() {
    setBusy(true);
    try {
      await api(`/playlist-groups/${g.id}/playlists`, { method: "PUT", body: { playlistIds: ids } });
      toast("Playlists saved");
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not save the playlists.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveMeta() {
    setBusy(true);
    try {
      await api(`/playlist-groups/${g.id}`, { method: "PATCH", body: { title: title.trim(), description, isActive } });
      toast("Section saved");
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not save the section.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Workspace
        leftTitle="Playlists"
        left={
          <div>
            <SearchField aria-label="Search playlists" value={filter} placeholder="Search playlists…" onChange={(e) => setFilter(e.target.value)} />
            <ul className="-mx-1 mt-2 divide-y divide-line">
              {candidates.length === 0 && <li className="px-1 py-6 text-center text-xs text-muted">{playlists.length === 0 ? "No editorial playlists yet." : "Nothing left to add."}</li>}
              {candidates.map((p) => {
                const others = (p.groups ?? []).filter((x) => x.id !== g.id);
                return (
                  <li key={p.id} className="flex items-center gap-2 px-1 py-2">
                    <Thumb p={p} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="truncate text-[11px] text-muted">
                        {p.trackCount} tracks{!(p.published ?? p.isPublic) ? " · unpublished" : ""}
                        {others.length > 0 && ` · also in ${others.map((x) => x.title).join(", ")}`}
                      </div>
                    </div>
                    <IconButton small variant="secondary" label={`Add ${p.name}`} onClick={() => setIds((c) => [...c, p.id])}>
                      <IPlus size={14} />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11px] text-muted">A playlist can be in several sections. It only shows in the app once it is published and has a playable track.</p>
          </div>
        }
        rightTitle="Inspector"
        right={
          <>
            <InspectorSection title="Details">
              <div className="space-y-3">
                <Field label="Title" htmlFor={idT} hint="The heading of the shelf in the app">
                  <Input id={idT} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="Description" htmlFor={idD}>
                  <Textarea id={idD} rows={3} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
                </Field>
                <label htmlFor={idA} className="flex items-center gap-2 text-sm">
                  <input id={idA} type="checkbox" className="accent-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Live in the app
                </label>
                <Button variant="primary" small disabled={!metaDirty || busy || !title.trim()} onClick={saveMeta}>
                  Save details
                </Button>
              </div>
            </InspectorSection>
            <InspectorSection title="Danger zone" defaultOpen={false}>
              <p className="mb-3 text-xs text-muted">Deleting removes the shelf from the app. The playlists in it are not deleted.</p>
              <Button variant="danger" small onClick={() => setDeleting(true)}>
                <ITrash size={14} /> Delete section
              </Button>
            </InspectorSection>
          </>
        }
        header={
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight">{g.title}</h1>
                {g.isActive ? <Badge tone="green">Live in the app</Badge> : <Badge>Hidden</Badge>}
                {orderDirty && <Badge tone="amber">Unsaved changes</Badge>}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {g.playlistCount} playlist{g.playlistCount === 1 ? "" : "s"} listed right now
              </div>
            </div>
          </div>
        }
      >
        <div className="rounded-card border border-line bg-panel">
          <div className="flex h-11 items-center justify-between gap-3 border-b border-line px-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              Playlists in this section <span className="text-xs font-normal text-muted">{ids.length}</span>
            </h2>
            <Button variant="primary" small disabled={!orderDirty || busy} onClick={saveOrder}>
              {busy ? "Saving…" : orderDirty ? "Save playlists" : "Saved"}
            </Button>
          </div>
          {ids.length === 0 ? (
            <div className="p-4">
              <Empty icon={<IPlaylist size={20} />}>No playlists yet. Add some from the list on the left.</Empty>
            </div>
          ) : (
            <ol className="divide-y divide-line py-1">
              {ids.map((pid, i) => (
                <MemberRow
                  key={pid}
                  pid={pid}
                  p={byId.get(pid)}
                  i={i}
                  last={i === ids.length - 1}
                  dragging={dragFrom === i}
                  onMove={(to) => setIds((c) => move(c, i, to))}
                  onRemove={() => setIds((c) => c.filter((x) => x !== pid))}
                  onDragStart={() => setDragFrom(i)}
                  onDrop={() => {
                    if (dragFrom !== null) setIds((c) => move(c, dragFrom, i));
                    setDragFrom(null);
                  }}
                  onDragEnd={() => setDragFrom(null)}
                />
              ))}
            </ol>
          )}
        </div>
      </Workspace>

      <ConfirmNameDialog
        open={deleting}
        title={`Delete the section "${g.title}"?`}
        description="The shelf disappears from the app. The playlists in it are not deleted and stay in their other sections."
        confirmValue={g.title}
        confirmLabel="Delete section"
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await api(`/playlist-groups/${g.id}`, { method: "DELETE" });
          toast("Section deleted");
          router.replace("/sections");
        }}
      />
    </>
  );
}

export default function SectionPage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<Section>(`/playlist-groups/${id}`);
  const pls = useApi<PlaylistList>("/playlists?limit=100");
  const g = q.data;
  usePageTitle(g?.title, "section");
  if (q.error)
    return (
      <div className="p-5">
        <ErrorBox error={q.error} onRetry={q.reload} />
      </div>
    );
  if (!g)
    return (
      <div className="p-5">
        <Loading />
      </div>
    );
  // The editor remounts with fresh state whenever the saved section changes.
  const sig = `${g.title}|${g.description}|${g.isActive}|${g.position}|${g.playlistIds.join(",")}`;
  return (
    <>
      {pls.error && (
        <div className="border-b border-line bg-panel px-5 py-2">
          <ErrorBox error={pls.error.code === "editorial_account_missing" || pls.error.code === "editorial_not_configured" ? "Playlist names could not be loaded: the editorial account is not set up on the server." : pls.error} onRetry={pls.reload} />
        </div>
      )}
      <Editor key={sig} g={g} playlists={pls.data?.playlists ?? []} reload={q.reload} />
    </>
  );
}
