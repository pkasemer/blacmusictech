"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Modal } from "@/components/Dialogs";
import { useToast } from "@/components/Shell";
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, PageHeader, Pagination, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { api, ApiError, qs } from "@/lib/api";
import { fmtDate } from "@/lib/format";
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
  const [creating, setCreating] = useState(false);
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
      {list.error && (list.error.code === "editorial_not_configured" ? <ErrorBox error="The editorial account is not configured on the server (EDITORIAL_OWNER_EMAIL)." /> : <ErrorBox error={list.error} onRetry={list.reload} />)}
      {!list.data && !list.error && <Loading />}
      {list.data && list.data.playlists.length === 0 && <Empty>No playlists yet. Create the first one.</Empty>}
      {list.data && list.data.playlists.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Playlist</Th>
                <Th>State</Th>
                <Th>Tracks</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.playlists.map((p) => (
                <tr key={p.id} className="hover:bg-canvas/50">
                  <Td>
                    <Link href={`/playlists/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    {p.description && <div className="max-w-md truncate text-xs text-muted">{p.description}</div>}
                  </Td>
                  <Td>{p.isPublic ? <Badge tone="green">Published</Badge> : <Badge>Unpublished</Badge>}</Td>
                  <Td className="tabular-nums">{p.trackCount}</Td>
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
