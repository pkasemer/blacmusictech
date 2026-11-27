"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtDuration } from "@/lib/format";
import { completion, termLabel, type ReleaseMetadata, type Taxonomy } from "@/lib/metadata";
import { useApi } from "@/lib/useApi";
import { BulkBar, BulkDialog, type BulkKind } from "./BulkMetadata";
import { SelectBox } from "./BulkPublish";
import { MetadataStatusBadge } from "./metadata-parts";
import { Button, Card, ErrorBox, Loading, Progress } from "./ui";

/** The release page's list of its tracks and how far their metadata has come. */
export function TrackMetadataCard({ releaseId, trackKey }: { releaseId: string; /** changes when the release's tracks change */ trackKey: string }) {
  const q = useApi<ReleaseMetadata>(`/releases/${releaseId}/track-metadata?v=${encodeURIComponent(trackKey)}`);
  const tax = useApi<Taxonomy>("/taxonomy");
  const error = q.error ?? tax.error;
  const unavailable = error?.code === "not_available";
  const data = q.data;
  const done = data ? completion(data.tracks) : undefined;
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [bulk, setBulk] = useState<BulkKind | null>(null);
  // only tracks still on the release count as ticked
  const selected = (data?.tracks ?? []).map((t) => t.trackId).filter((id) => picked.has(id));
  const toggle = (id: string, on: boolean) =>
    setPicked((old) => {
      const next = new Set(old);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Card title="Track metadata">
      {unavailable ? (
        <p className="text-sm text-muted">Track metadata is not available on the server yet. It appears here once the server has been updated.</p>
      ) : error ? (
        <ErrorBox error={error} onRetry={() => (q.reload(), tax.reload())} />
      ) : !data || !tax.data || !done ? (
        <Loading rows={3} />
      ) : data.tracks.length === 0 ? (
        <p className="text-sm text-muted">There are no tracks to describe yet.</p>
      ) : (
        <>
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium">
                {done.enriched} of {done.total} track{done.total === 1 ? "" : "s"} enriched
              </span>
              <span className="text-xs text-muted">
                {data.tracks.filter((t) => t.status === "pending_review").length} waiting for review · {done.verified} verified
              </span>
            </div>
            <Progress value={(done.enriched / done.total) * 100} label="Tracks enriched" tone={done.enriched === done.total ? "green" : "blue"} />
          </div>
          <BulkBar count={selected.length} onChange={() => setBulk("change")} onVerify={() => setBulk("verify")} onClear={() => setPicked(new Set())} />
          <label className="flex items-center gap-3 border-b border-line pb-2 text-xs font-medium text-muted">
            <SelectBox label="Select every track" checked={selected.length === data.tracks.length} mixed={selected.length > 0} onChange={(on) => setPicked(new Set(on ? data.tracks.map((t) => t.trackId) : []))} />
            Select all
          </label>
          <ul className="divide-y divide-line">
            {data.tracks.map((t) => (
              <li key={t.trackId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <SelectBox label={`Select ${t.title}`} checked={picked.has(t.trackId)} onChange={(on) => toggle(t.trackId, on)} />
                <div className="min-w-0 flex-1 basis-56 break-words">
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="text-xs text-muted">
                    {t.artist.name}
                    {t.featuredArtists.length > 0 && ` ft. ${t.featuredArtists.join(", ")}`} · {fmtDuration(t.durationMs)}
                  </div>
                  <dl className="mt-1 flex flex-wrap gap-x-4 text-xs">
                    <div className="flex gap-1">
                      <dt className="text-muted">Languages:</dt>
                      <dd>{t.languageUnknown ? "Unknown" : t.languages.length ? t.languages.map((l) => `${termLabel(tax.data!.languages, l.id)}${l.role === "primary" && t.languages.length > 1 ? " (primary)" : ""}`).join(", ") : "–"}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt className="text-muted">Genres:</dt>
                      <dd>{t.genres.length ? t.genres.map((g) => termLabel(tax.data!.genres, g.id)).join(", ") : "–"}</dd>
                    </div>
                  </dl>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <MetadataStatusBadge status={t.status} />
                  <Link href={`/releases/${releaseId}/tracks/${t.trackId}`} aria-label={`${t.status === "not_started" ? "Enrich" : "Edit"} metadata of ${t.title}`}>
                    <Button small variant={t.status === "not_started" ? "primary" : "secondary"}>
                      {t.status === "not_started" ? "Enrich" : "Edit"}
                    </Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <BulkDialog kind={bulk} trackIds={selected} tax={tax.data} onClose={() => setBulk(null)} onApplied={() => (setPicked(new Set()), q.reload())} />
        </>
      )}
    </Card>
  );
}
