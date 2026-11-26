"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Modal } from "@/components/Dialogs";
import { useToast } from "@/components/Shell";
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, PageHeader, Table, Td, Textarea, Th } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Section, SectionList } from "@/lib/types";
import { useApi } from "@/lib/useApi";

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="New section" onClose={onClose}>
      {open && <CreateForm onClose={onClose} />}
    </Modal>
  );
}

function CreateForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const a = useId();
  const b = useId();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const g = await api<Section>("/playlist-groups", { method: "POST", body: { title: title.trim(), description: description.trim() } });
          toast("Section created");
          router.push(`/sections/${g.id}`);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not create the section.");
          setBusy(false);
        }
      }}
    >
      <Field label="Title" htmlFor={a} hint="Shown as the heading of the shelf in the app, e.g. Workout">
        <Input id={a} value={title} maxLength={60} autoFocus onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description (optional)" htmlFor={b}>
        <Textarea id={b} rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {error && <ErrorBox error={error} />}
      <p className="text-xs text-muted">It is added at the end and starts active. Add playlists to it on the next page.</p>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!title.trim() || busy}>
          {busy ? "Creating…" : "Create section"}
        </Button>
      </div>
    </form>
  );
}

export default function SectionsPage() {
  const q = useApi<SectionList>("/playlist-groups");
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const [creating, setCreating] = useState(params.get("new") === "1");
  useEffect(() => {
    if (params.get("new") === "1") router.replace("/sections");
  }, [params, router]);
  const [busy, setBusy] = useState(false);
  const groups = q.data?.groups ?? [];

  /** Moves a section up or down by giving every section a clean 10, 20, 30... position and saving the changed ones. */
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= groups.length) return;
    const order = [...groups];
    [order[i], order[j]] = [order[j]!, order[i]!];
    setBusy(true);
    try {
      await Promise.all(order.map((g, k) => ((k + 1) * 10 !== g.position ? api(`/playlist-groups/${g.id}`, { method: "PATCH", body: { position: (k + 1) * 10 } }) : null)));
      q.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not reorder.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(g: Section) {
    setBusy(true);
    try {
      await api(`/playlist-groups/${g.id}`, { method: "PATCH", body: { isActive: !g.isActive } });
      toast(g.isActive ? "Section hidden from the app" : "Section is live in the app");
      q.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not change the section.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Sections"
        subtitle="The titled shelves on the app's Home screen, each with playlists in it. A playlist can be in more than one section."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New section
          </Button>
        }
      />
      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}
      {!q.data && !q.error && <Loading />}
      {q.data && groups.length === 0 && <Empty>No sections yet. Create the first one, then add playlists to it.</Empty>}
      {groups.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Section</Th>
              <Th>Playlists</Th>
              <Th>In the app</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => (
              <tr key={g.id} className="hover:bg-canvas/50">
                <Td className="w-28">
                  <div className="flex gap-1">
                    <Button small variant="ghost" aria-label={`Move ${g.title} up`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                      ↑
                    </Button>
                    <Button small variant="ghost" aria-label={`Move ${g.title} down`} disabled={busy || i === groups.length - 1} onClick={() => move(i, 1)}>
                      ↓
                    </Button>
                  </div>
                </Td>
                <Td>
                  <Link href={`/sections/${g.id}`} className="font-medium hover:underline">
                    {g.title}
                  </Link>
                  {g.description && <div className="max-w-md truncate text-xs text-muted">{g.description}</div>}
                </Td>
                <Td className="tabular-nums">
                  {g.playlistIds.length}
                  {g.playlistCount < g.playlistIds.length && <span className="text-xs text-amber-700"> ({g.playlistCount} listed)</span>}
                </Td>
                <Td>{g.isActive ? <Badge tone="green">Live</Badge> : <Badge>Hidden</Badge>}</Td>
                <Td className="text-right">
                  <Button small disabled={busy} onClick={() => toggle(g)}>
                    {g.isActive ? "Hide" : "Make live"}
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="mt-3 text-xs text-muted">&ldquo;Listed&rdquo; counts only the playlists listeners can see right now (published and with at least one playable track).</p>
      <CreateDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
