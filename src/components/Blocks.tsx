"use client";

import { useState } from "react";
import { Modal, ReasonDialog } from "@/components/Dialogs";
import { Chips } from "@/components/import-parts";
import { PlayButton } from "@/components/Player";
import { useToast } from "@/components/Shell";
import { Badge, Button, Card, Empty, ErrorBox, Loading, SearchField, Table, Td, Th } from "@/components/ui";
import { api, ApiError, qs } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { blockDescription, blockedMessage, notAvailable, unblockDescription, type Block, type BlockTarget } from "@/lib/recommendations";
import type { ArtistList, SearchTrack } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

/** Asks why, then keeps a song or an artist out of suggestions. Used wherever there is something to block. */
export function BlockDialog({ target, onClose, onBlocked }: { target: BlockTarget | null; onClose: () => void; onBlocked: () => void }) {
  const toast = useToast();
  return (
    <ReasonDialog
      open={target !== null}
      title={target ? `Block ${target.kind === "artist" ? "all songs by " : ""}"${target.name}"?` : ""}
      description={target ? blockDescription(target.kind) : ""}
      confirmLabel="Block from suggestions"
      reasonLabel="Why (kept in the list and the audit log)"
      danger
      onClose={onClose}
      onSubmit={async (reason) => {
        if (!target) return;
        const r = await api<{ id: number; removedFromPlaylists: number }>("/recommendations/blocks", {
          method: "POST",
          body: target.kind === "artist" ? { artistId: target.id, reason } : { trackId: target.id, reason },
        });
        toast(blockedMessage(r.removedFromPlaylists));
        onBlocked();
      }}
    />
  );
}

export function BlocksCard() {
  const toast = useToast();
  const q = useApi<{ blocks: Block[] }>("/recommendations/blocks");
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<BlockTarget | null>(null);
  const [undo, setUndo] = useState<Block | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string>();
  const unavailable = notAvailable(q.error);

  async function unblock(b: Block) {
    setBusy(true);
    setFailed(undefined);
    try {
      await api(`/recommendations/blocks/${b.id}`, { method: "DELETE" });
      toast(`"${b.name}" can be suggested again`);
      setUndo(null);
      q.reload();
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "Could not unblock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Blocked from suggestions" className="mt-4" actions={unavailable ? undefined : <Button onClick={() => setAdding(true)}>Block a song or artist</Button>}>
      <p className="mb-3 text-sm text-muted">Blocked songs are not suggested in mixes, autoplay or Your sound. They still play, appear in search and stay in listeners&apos; own playlists.</p>
      {unavailable ? (
        <p className="text-sm text-muted">The server cannot block suggestions yet. This appears once it has been updated.</p>
      ) : q.error ? (
        <ErrorBox error={q.error} onRetry={q.reload} />
      ) : !q.data ? (
        <Loading rows={2} />
      ) : q.data.blocks.length === 0 ? (
        <Empty>Nothing is blocked.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Blocked</Th>
              <Th>Why</Th>
              <Th>By</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {q.data.blocks.map((b) => (
              <tr key={b.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    {b.kind === "track" && <PlayButton track={{ id: b.targetId, title: b.name, artist: b.artistName }} />}
                    <div className="min-w-0">
                      <div className="font-medium">{b.name}</div>
                      <div className="text-[11px] text-muted">
                        <Badge tone={b.kind === "artist" ? "amber" : "gray"}>{b.kind === "artist" ? "Artist" : "Song"}</Badge>{" "}
                        {b.kind === "artist" ? `${b.songs} public ${b.songs === 1 ? "song" : "songs"} now, and any added later` : b.artistName}
                      </div>
                    </div>
                  </div>
                </Td>
                <Td className="max-w-xs break-words text-sm">{b.reason}</Td>
                <Td className="text-xs text-muted">
                  <div>{b.blockedBy?.email ?? "A removed account"}</div>
                  <div>{fmtDateTime(b.blockedAt)}</div>
                </Td>
                <Td className="text-right">
                  <Button small aria-label={`Unblock ${b.name}`} onClick={() => (setFailed(undefined), setUndo(b))}>
                    Unblock
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal open={adding} title="Block a song or artist" onClose={() => setAdding(false)}>
        {adding && <Finder onPick={(t) => (setAdding(false), setTarget(t))} />}
      </Modal>
      <BlockDialog target={target} onClose={() => setTarget(null)} onBlocked={q.reload} />
      <Modal open={undo !== null} title={undo ? `Unblock "${undo.name}"?` : ""} onClose={() => setUndo(null)} dismissable={!busy}>
        {undo && (
          <>
            <p className="text-sm text-muted">{unblockDescription(undo)}</p>
            {failed && (
              <div className="mt-3">
                <ErrorBox error={failed} />
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button disabled={busy} onClick={() => setUndo(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void unblock(undo)}>
                {busy ? "Unblocking…" : "Unblock"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </Card>
  );
}

/** Finds the song or artist to block. */
function Finder({ onPick }: { onPick: (t: BlockTarget) => void }) {
  const [kind, setKind] = useState<"track" | "artist">("track");
  const [text, setText] = useState("");
  const term = useDebounced(text.trim());
  const ready = term.length >= 2;
  const songs = useApi<{ tracks: SearchTrack[] }>(ready && kind === "track" ? `/api/search?q=${encodeURIComponent(term)}&limit=10` : null);
  const artists = useApi<ArtistList>(ready && kind === "artist" ? `/artists${qs({ q: term, limit: 10 })}` : null);
  const now = kind === "track" ? songs : artists;
  const found: (BlockTarget & { detail: string })[] =
    kind === "track"
      ? (songs.data?.tracks ?? []).filter((t): t is SearchTrack & { id: string } => !!t.id).map((t) => ({ kind: "track", id: t.id, name: t.title, detail: t.artistName ?? "" }))
      : (artists.data?.artists ?? []).map((a) => ({ kind: "artist", id: a.id, name: a.name, detail: `${a.releaseCount} ${a.releaseCount === 1 ? "release" : "releases"}` }));
  return (
    <div>
      <Chips
        label="What to block"
        value={kind}
        onChange={setKind}
        options={[
          { value: "track", label: "A song", count: "" },
          { value: "artist", label: "An artist", count: "" },
        ]}
      />
      <SearchField
        aria-label={kind === "track" ? "Search for a song to block" : "Search for an artist to block"}
        className="mt-3"
        value={text}
        placeholder={kind === "track" ? "Search songs…" : "Search artists…"}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2 min-h-24">
        {!ready && <p className="py-6 text-center text-xs text-muted">Type at least two letters.</p>}
        {ready && now.loading && <Loading rows={2} />}
        {ready && now.error && <ErrorBox error={now.error} onRetry={now.reload} />}
        {ready && !now.loading && !now.error && found.length === 0 && <p className="py-6 text-center text-xs text-muted">Nothing found.</p>}
        {ready && !now.loading && (
          <ul className="divide-y divide-line">
            {found.map((f) => (
              <li key={f.id}>
                <button type="button" className="w-full rounded-control px-2 py-1.5 text-left hover:bg-sunken" onClick={() => onPick(f)}>
                  <span className="block truncate text-sm font-medium">{f.name}</span>
                  <span className="block truncate text-[11px] text-muted">{f.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
