"use client";

import Link from "next/link";
import { useState } from "react";
import { VisibilityBadge } from "@/components/badges";
import { Empty, ErrorBox, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th } from "@/components/ui";
import { qs } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { ReleaseList } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

const LIMIT = 25;

export default function ReleasesPage() {
  const [q, setQ] = useState("");
  const [visibility, setVisibility] = useState("");
  const [type, setType] = useState("");
  const [takenDown, setTakenDown] = useState("");
  const [offset, setOffset] = useState(0);
  const term = useDebounced(q);
  const list = useApi<ReleaseList>(`/releases${qs({ q: term, visibility, type, takenDown, limit: LIMIT, offset })}`);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setOffset(0);
  };

  return (
    <>
      <PageHeader title="Releases" subtitle="Singles and albums in every state, including drafts and taken-down ones" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input aria-label="Search releases" className="max-w-xs" placeholder="Search by title or artist" value={q} onChange={(e) => reset(setQ)(e.target.value)} />
        <Select aria-label="Visibility" value={visibility} onChange={(e) => reset(setVisibility)(e.target.value)}>
          <option value="">Any visibility</option>
          <option value="public">Public</option>
          <option value="scheduled">Scheduled</option>
          <option value="draft">Draft</option>
        </Select>
        <Select aria-label="Type" value={type} onChange={(e) => reset(setType)(e.target.value)}>
          <option value="">Singles and albums</option>
          <option value="single">Singles</option>
          <option value="album">Albums</option>
        </Select>
        <Select aria-label="Takedown" value={takenDown} onChange={(e) => reset(setTakenDown)(e.target.value)}>
          <option value="">Taken down or not</option>
          <option value="true">Taken down</option>
          <option value="false">Not taken down</option>
        </Select>
      </div>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data && list.data.releases.length === 0 && <Empty>No releases match.</Empty>}
      {list.data && list.data.releases.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Release</Th>
                <Th>Artist</Th>
                <Th>State</Th>
                <Th>Tracks</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.releases.map((r) => (
                <tr key={r.id} className="hover:bg-canvas/50">
                  <Td>
                    <Link href={`/releases/${r.id}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <div className="text-xs capitalize text-muted">{r.type}</div>
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
                  <Td className="text-muted">{fmtDate(r.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination total={list.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      )}
    </>
  );
}
