"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { SectionList } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useToast } from "./Shell";
import { ErrorBox, Loading } from "./ui";

/** Tick the sections a playlist should appear in. A playlist can be in several; new ones are added at the end of the shelf. */
export function SectionsCard({ playlistId, onChanged }: { playlistId: string; onChanged: () => void }) {
  const toast = useToast();
  const q = useApi<SectionList>("/playlist-groups");
  const [busy, setBusy] = useState<string | null>(null);

  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const groups = q.data.groups;
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted">
        There are no sections yet.{" "}
        <Link href="/sections" className="text-brand hover:underline">
          Create one
        </Link>{" "}
        to put this playlist on the app&rsquo;s Home screen.
      </p>
    );
  }

  async function toggle(gid: string, checked: boolean) {
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    const ids = checked ? [...g.playlistIds.filter((x) => x !== playlistId), playlistId] : g.playlistIds.filter((x) => x !== playlistId);
    setBusy(gid);
    try {
      await api(`/playlist-groups/${gid}/playlists`, { method: "PUT", body: { playlistIds: ids } });
      toast(checked ? `Added to ${g.title}` : `Removed from ${g.title}`);
      q.reload();
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not change the section.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="space-y-1.5">
      {groups.map((g) => (
        <li key={g.id}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={g.playlistIds.includes(playlistId)} disabled={busy !== null} onChange={(e) => void toggle(g.id, e.target.checked)} />
            <Link href={`/sections/${g.id}`} className="hover:underline">
              {g.title}
            </Link>
            {!g.isActive && <span className="text-xs text-muted">(hidden)</span>}
          </label>
        </li>
      ))}
    </ul>
  );
}
