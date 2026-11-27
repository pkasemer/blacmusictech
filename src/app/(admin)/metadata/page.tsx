"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArtistFilter, type PickedArtist } from "@/components/ArtistFilter";
import { BulkBar, BulkDialog, type BulkKind } from "@/components/BulkMetadata";
import { SelectBox } from "@/components/BulkPublish";
import { Chips } from "@/components/import-parts";
import { MetadataStatusBadge } from "@/components/metadata-parts";
import { Button, Empty, ErrorBox, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th } from "@/components/ui";
import { qs } from "@/lib/api";
import { QUEUES, REQUIRED_LABEL, type Queue, type QueueList, type Taxonomy } from "@/lib/metadata";
import { useApi, useDebounced } from "@/lib/useApi";

const LIMIT = 25;

export default function MetadataReviewPage() {
  const router = useRouter();
  const params = useSearchParams();
  // the chosen queue lives in the address, so coming back from a track returns to it
  const asked = params.get("queue");
  const queue: Queue = QUEUES.find((x) => x.value === asked)?.value ?? "pending_review";
  const [artist, setArtist] = useState<PickedArtist | null>(null);
  const [releaseType, setType] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const term = useDebounced(q);
  const list = useApi<QueueList>(`/metadata/tracks${qs({ queue, artistId: artist?.id ?? "", releaseType, q: term, limit: LIMIT, offset })}`);
  const unavailable = list.error?.code === "not_available" || list.error?.status === 404;
  const data = list.data;
  const tax = useApi<Taxonomy>("/taxonomy");
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [bulk, setBulk] = useState<BulkKind | null>(null);
  // ticks apply to the rows on screen only: nothing out of sight is ever changed
  const shown = data?.tracks.map((t) => t.trackId) ?? [];
  const selected = shown.filter((id) => picked.has(id));
  const toggle = (id: string, on: boolean) =>
    setPicked((old) => {
      const next = new Set(old);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <>
      <PageHeader title="Metadata review" subtitle="Work through tracks that need attention. Open a track to complete or verify its metadata." />
      {unavailable ? (
        <Empty>The review queue is not available on the server yet. It appears here once the server has been updated.</Empty>
      ) : (
        <>
          <Chips
            label="Queue"
            value={queue}
            onChange={(v) => {
              setOffset(0);
              router.replace(`/metadata?queue=${v}`);
            }}
            options={QUEUES.map((x) => ({ value: x.value, label: x.label, count: data ? data.counts[x.value] : "…" }))}
          />
          <div className="my-4 flex flex-wrap gap-2">
            <ArtistFilter value={artist} onChange={(a) => (setArtist(a), setOffset(0))} />
            <Select aria-label="Release type" value={releaseType} onChange={(e) => (setType(e.target.value), setOffset(0))}>
              <option value="">All release types</option>
              <option value="single">Singles</option>
              <option value="album">Albums and EPs</option>
            </Select>
            <Input aria-label="Search tracks" className="max-w-xs" placeholder="Track or release title" value={q} onChange={(e) => (setQ(e.target.value), setOffset(0))} />
          </div>
          {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
          {!data && !list.error && <Loading />}
          {data && data.tracks.length === 0 && <Empty>Nothing is in this queue.</Empty>}
          {data && data.tracks.length > 0 && (
            <>
              <BulkBar count={selected.length} onChange={() => setBulk("change")} onVerify={() => setBulk("verify")} onClear={() => setPicked(new Set())} />
              <Table>
                <thead>
                  <tr>
                    <Th className="w-10">
                      <SelectBox label="Select every track on this page" checked={selected.length === shown.length} mixed={selected.length > 0} onChange={(on) => setPicked(new Set(on ? shown : []))} />
                    </Th>
                    <Th>Track</Th>
                    <Th>Release</Th>
                    <Th>Missing</Th>
                    <Th>Status</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {data.tracks.map((t) => (
                    <tr key={t.trackId} className="hover:bg-sunken/50">
                      <Td>
                        <SelectBox label={`Select ${t.title}`} checked={picked.has(t.trackId)} onChange={(on) => toggle(t.trackId, on)} />
                      </Td>
                      <Td>
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs text-muted">{t.artist.name}</div>
                      </Td>
                      <Td>
                        <Link href={`/releases/${t.releaseId}`} className="hover:text-primary">
                          {t.releaseTitle}
                        </Link>
                      </Td>
                      <Td className="text-sm text-muted">{t.missingRequired.length ? t.missingRequired.map((f) => REQUIRED_LABEL[f] ?? f).join(", ") : "–"}</Td>
                      <Td>
                        <MetadataStatusBadge status={t.status} />
                      </Td>
                      <Td className="text-right">
                        <Link href={`/releases/${t.releaseId}/tracks/${t.trackId}`} aria-label={`Open metadata of ${t.title}`}>
                          <Button small>Open</Button>
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
            </>
          )}
        </>
      )}
      {tax.data && <BulkDialog kind={bulk} trackIds={selected} tax={tax.data} onClose={() => setBulk(null)} onApplied={() => (setPicked(new Set()), list.reload())} />}
    </>
  );
}
