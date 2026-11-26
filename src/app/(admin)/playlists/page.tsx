"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Modal } from "@/components/Dialogs";
import { useToast } from "@/components/Shell";
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, PageHeader, Pagination, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { api, ApiError, qs } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { editorialMessage } from "@/lib/editorial";
import type { PlaylistDetail, PlaylistList } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

const LIMIT = 25;

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const a = useId();
  const b = useId();
  return (
    <Modal open={open} title="New editorial playlist" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const p = await api<PlaylistDetail>("/playlists", { method: "POST", body: { name: name.trim(), description: description.trim() } });
            toast("Playlist created");
            setName("");
            setDescription("");
            router.push(`/playlists/${p.id}`);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not create the playlist.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Name" htmlFor={a}>
          <Input id={a} value={name} maxLength={100} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor={b}>
          <Textarea id={b} rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {error && <ErrorBox error={error} />}
        <p className="text-xs text-muted">It starts unpublished. Add tracks, then publish it.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || busy}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function PlaylistsPage() {
  const [q, setQ] = useState("");
  const [published, setPublished] = useState("");
  const [offset, setOffset] = useState(0);
  const params = useSearchParams();
  const router = useRouter();
  const [creating, setCreating] = useState(params.get("new") === "1");
  useEffect(() => {
    if (params.get("new") === "1") router.replace("/playlists");
  }, [params, router]);
  const term = useDebounced(q);
  const list = useApi<PlaylistList>(`/playlists${qs({ q: term, published, limit: LIMIT, offset })}`);

  return (
    <>
      <PageHeader
        title="Editorial playlists"
        subtitle="Playlists curated by the Blac Music team"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New playlist
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input aria-label="Search playlists" className="max-w-xs" placeholder="Search by name" value={q} onChange={(e) => (setQ(e.target.value), setOffset(0))} />
        <Select aria-label="Published" value={published} onChange={(e) => (setPublished(e.target.value), setOffset(0))}>
          <option value="">Published or not</option>
          <option value="true">Published</option>
          <option value="false">Unpublished</option>
        </Select>
      </div>
      {list.error && <ErrorBox error={editorialMessage(list.error.code) ?? list.error} onRetry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data && list.data.playlists.length === 0 && <Empty>No playlists yet. Create the first one.</Empty>}
      {list.data && list.data.playlists.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Playlist</Th>
                <Th>Sections</Th>
                <Th>State</Th>
                <Th>Tracks</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.playlists.map((p) => (
                <tr key={p.id} className="hover:bg-canvas/50">
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-canvas text-[10px] text-amber-700">
                        {p.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- served by the API's own media host
                          <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          "no cover"
                        )}
                      </div>
                      <div className="min-w-0">
                        <Link href={`/playlists/${p.id}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                        {p.description && <div className="max-w-md truncate text-xs text-muted">{p.description}</div>}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {p.groups && p.groups.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {p.groups.map((g) => (
                          <Link key={g.id} href={`/sections/${g.id}`}>
                            <Badge tone="blue">{g.title}</Badge>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted">none</span>
                    )}
                  </Td>
                  <Td>{p.published ?? p.isPublic ? <Badge tone="green">Published</Badge> : <Badge>Unpublished</Badge>}</Td>
                  <Td className="tabular-nums">{p.trackCount}{p.playableTrackCount !== undefined && p.playableTrackCount < p.trackCount && <span className="text-xs text-amber-700"> ({p.playableTrackCount} playable)</span>}</Td>
                  <Td className="text-muted">{fmtDate(p.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination total={list.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      )}
      <CreateDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
