"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArtistFilter, type PickedArtist } from "@/components/ArtistFilter";
import { VisibilityBadge } from "@/components/badges";
import { BulkPublishDialog, SelectBox, SelectionBar, useSelection } from "@/components/BulkPublish";
import { Badge, Button, Empty, ErrorBox, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th } from "@/components/ui";
import { qs } from "@/lib/api";
import { whyNotSelectable } from "@/lib/bulk";
import { fmtDate } from "@/lib/format";
import type { ReleaseList } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

const PAGE_SIZES = [25, 50, 100];

export default function ReleasesPage() {
  const [q, setQ] = useState("");
  const params = useSearchParams();
  const [visibility, setVisibility] = useState(params.get("visibility") ?? "");
  const [type, setType] = useState("");
  const [takenDown, setTakenDown] = useState(params.get("takenDown") ?? "");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZES[0]!);
  const [publishing, setPublishing] = useState(false);
  const [artist, setArtist] = useState<PickedArtist | null>(null);
  const [metadata, setMetadata] = useState(params.get("metadata") ?? "");
  const [pendingReview, setPendingReview] = useState(params.get("pendingReview") ?? "");
  const term = useDebounced(q);
  const list = useApi<ReleaseList>(`/releases${qs({ q: term, visibility, type, takenDown, artistId: artist?.id ?? "", metadata, pendingReview, limit, offset })}`);
  const selection = useSelection();
  const rows = list.data?.releases ?? [];
  // an older server sends no progress (and would ignore the filters): do not offer them
  const withMetadata = rows.some((r) => !!r.metadata) || !!metadata || !!pendingReview;
  const pickable = rows.filter((r) => !whyNotSelectable(r));
  const pickedHere = pickable.filter((r) => selection.has(r.id)).length;
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setOffset(0);
  };

  return (
    <>
      <PageHeader
        title="Releases"
        subtitle="Singles and albums in every state, including drafts and taken-down ones"
        actions={
          <Link href="/releases/new">
            <Button variant="primary">New release</Button>
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input aria-label="Search releases" className="max-w-xs" placeholder="Search by title or artist" value={q} onChange={(e) => reset(setQ)(e.target.value)} />
        <Select aria-label="Visibility" value={visibility} onChange={(e) => reset(setVisibility)(e.target.value)}>
          <option value="">Any visibility (taken-down ones count as draft)</option>
          <option value="public">Public</option>
          <option value="scheduled">Scheduled</option>
          <option value="draft">Draft</option>
        </Select>
        <Select aria-label="Type" value={type} onChange={(e) => reset(setType)(e.target.value)}>
          <option value="">All types</option>
          <option value="single">Singles</option>
          <option value="album">Albums and EPs</option>
        </Select>
        <Select aria-label="Takedown" value={takenDown} onChange={(e) => reset(setTakenDown)(e.target.value)}>
          <option value="">Taken down or not</option>
          <option value="true">Taken down</option>
          <option value="false">Not taken down</option>
        </Select>
        <ArtistFilter value={artist} onChange={(a) => (setArtist(a), setOffset(0))} />
        {withMetadata && (
          <>
            <Select aria-label="Metadata status" value={metadata} onChange={(e) => reset(setMetadata)(e.target.value)}>
              <option value="">Any metadata status</option>
              <option value="not_started">Metadata not started</option>
              <option value="in_progress">Metadata in progress</option>
              <option value="completed">Metadata completed</option>
            </Select>
            <Select aria-label="Review" value={pendingReview} onChange={(e) => reset(setPendingReview)(e.target.value)}>
              <option value="">Reviewed or not</option>
              <option value="true">Has tracks waiting for review</option>
            </Select>
          </>
        )}
        <Select aria-label="Rows per page" value={limit} onChange={(e) => reset(setLimit)(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} per page
            </option>
          ))}
        </Select>
      </div>
      <SelectionBar count={selection.items.length} hidden={selection.items.length - rows.filter((r) => selection.has(r.id)).length} onPublish={() => setPublishing(true)} onClear={selection.clear} />
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data && list.data.releases.length === 0 && <Empty>No releases match.</Empty>}
      {list.data && list.data.releases.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th className="w-10">
                  <SelectBox
                    label={pickable.length === 0 ? "Nothing on this page can be published" : "Select everything on this page that can be published"}
                    disabled={pickable.length === 0}
                    checked={pickable.length > 0 && pickedHere === pickable.length}
                    mixed={pickedHere > 0}
                    onChange={(on) => selection.set(pickable, on)}
                  />
                </Th>
                <Th>Release</Th>
                <Th>Artist</Th>
                <Th>State</Th>
                <Th>Tracks</Th>
                {withMetadata && <Th>Metadata</Th>}
                <Th>Release date</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.releases.map((r) => (
                <tr key={r.id} className="hover:bg-canvas/50">
                  <Td>
                    <SelectBox label={whyNotSelectable(r) ?? `Select ${r.title}`} disabled={!!whyNotSelectable(r)} checked={selection.has(r.id)} onChange={(on) => selection.set([r], on)} />
                  </Td>
                  <Td>
                    <Link href={`/releases/${r.id}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <div className="text-xs capitalize text-muted">{r.featured ? "★ Featured · " : ""}{r.kind ?? r.type}{r.takenDown && r.previousVisibility ? ` · was ${r.previousVisibility}` : ""}</div>
                  </Td>
                  <Td>
                    <Link href={`/artists/${r.artistId}`} className="hover:underline">
                      {r.artistName}
                    </Link>
                  </Td>
                  <Td>
                    <VisibilityBadge v={r.visibility} takenDown={r.takenDown} />
                  </Td>
                  <Td className="tabular-nums">{r.trackCount}</Td>
                  {withMetadata && (
                    <Td className="whitespace-nowrap text-xs">
                      {r.metadata ? (
                        <>
                          <div>
                            {r.metadata.enriched} of {r.metadata.total} enriched
                          </div>
                          {r.metadata.status === "completed" ? <Badge tone="green">Completed</Badge> : r.metadata.pendingReview > 0 ? <Badge tone="amber">{r.metadata.pendingReview} to review</Badge> : <Badge tone={r.metadata.status === "in_progress" ? "blue" : "gray"}>{r.metadata.status === "in_progress" ? "In progress" : "Not started"}</Badge>}
                        </>
                      ) : (
                        "–"
                      )}
                    </Td>
                  )}
                  <Td className="whitespace-nowrap text-muted">{fmtDate(r.releaseDate)}</Td>
                  <Td className="text-muted">{fmtDate(r.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination total={list.data.total} limit={limit} offset={offset} onChange={setOffset} />
        </>
      )}
      <BulkPublishDialog
        open={publishing}
        items={selection.items}
        onClose={() => setPublishing(false)}
        onFinished={(ids) => {
          selection.remove(ids);
          list.reload();
        }}
      />
    </>
  );
}
