"use client";

import Link from "next/link";
import { useState } from "react";
import { VerificationBadge } from "@/components/badges";
import { Badge, Empty, ErrorBox, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th } from "@/components/ui";
import { qs } from "@/lib/api";
import { fmtDate, fmtNum } from "@/lib/format";
import type { ArtistList } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

const LIMIT = 25;

export default function ArtistsPage() {
  const [q, setQ] = useState("");
  const [verification, setVerification] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const term = useDebounced(q);
  const list = useApi<ArtistList>(`/artists${qs({ q: term, verification, status, limit: LIMIT, offset })}`);

  return (
    <>
      <PageHeader title="Artists" subtitle="Artist profiles, including catalog artists without an account" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input aria-label="Search artists" className="max-w-xs" placeholder="Search by name" value={q} onChange={(e) => (setQ(e.target.value), setOffset(0))} />
        <Select aria-label="Verification" value={verification} onChange={(e) => (setVerification(e.target.value), setOffset(0))}>
          <option value="">Any verification</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
          <option value="unverified">Not verified</option>
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => (setStatus(e.target.value), setOffset(0))}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
          <option value="flagged">Flagged (name matches a verified artist)</option>
        </Select>
      </div>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data && list.data.artists.length === 0 && <Empty>No artists match.</Empty>}
      {list.data && list.data.artists.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Artist</Th>
                <Th>Verification</Th>
                <Th>Releases</Th>
                <Th>Followers</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.artists.map((a) => (
                <tr key={a.id} className="hover:bg-canvas/50">
                  <Td>
                    <Link href={`/artists/${a.id}`} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                    <div className="text-xs text-muted">{a.ownerEmail ?? "Catalog artist (no account)"}</div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <VerificationBadge v={a.verification} />
                      {a.banned && <Badge tone="red">Banned</Badge>}
                      {a.flagged && <Badge tone="amber">Flagged</Badge>}
                    </div>
                  </Td>
                  <Td className="tabular-nums">{fmtNum(a.releaseCount)}</Td>
                  <Td className="tabular-nums">{fmtNum(a.followerCount)}</Td>
                  <Td className="text-muted">{fmtDate(a.createdAt)}</Td>
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
