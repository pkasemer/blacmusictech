"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Empty, ErrorBox, Loading, PageHeader, Pagination, Select } from "@/components/ui";
import { qs } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { isProfile, kindLabel, STATUS_LABEL, STATUS_TONE, waited, type ReviewList, type ReviewRow } from "@/lib/reviews";
import { useApi, usePoll } from "@/lib/useApi";

const LIMIT = 25;

function Row({ r }: { r: ReviewRow }) {
  return (
    <li>
      <Link href={`/reviews/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 hover:bg-sunken/60">
        {r.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- from the API's own media host
          <img src={r.coverUrl} alt="" className={`size-12 shrink-0 border border-line object-cover ${isProfile(r) ? "rounded-full" : "rounded-control"}`} />
        ) : (
          <span className={`flex size-12 shrink-0 items-center justify-center border border-line bg-sunken text-[10px] text-faint ${isProfile(r) ? "rounded-full" : "rounded-control"}`}>{isProfile(r) ? "No photo" : "No cover"}</span>
        )}
        <span className="min-w-0 flex-1 basis-48">
          <span className="block truncate text-sm font-semibold">{r.title}</span>
          <span className="block truncate text-xs text-muted">{isProfile(r) ? "Artist profile" : `${r.artist.name} · ${r.type}`}</span>
          {!!r.changes?.length && <span className="mt-0.5 block truncate text-xs text-muted">Changed: {r.changes.join(", ")}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={r.kind === "new" ? "blue" : "gray"}>{kindLabel(r)}</Badge>
          {r.status !== "pending" && <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>}
        </span>
        <span className="w-full text-xs text-muted sm:w-44 sm:text-right">
          <span className="block">{r.status === "pending" ? `Waiting ${waited(r.submittedAt)}` : fmtDateTime(r.decidedAt ?? r.submittedAt)}</span>
          {r.publishAt && r.status === "pending" && <span className="block">Asked to go live {fmtDateTime(r.publishAt)}</span>}
        </span>
      </Link>
    </li>
  );
}

export default function ReviewsPage() {
  const [status, setStatus] = useState("pending");
  const [kind, setKind] = useState("");
  const [subject, setSubject] = useState("");
  const [offset, setOffset] = useState(0);
  const q = useApi<ReviewList>(`/reviews${qs({ status, kind, subject, limit: LIMIT, offset })}`);
  usePoll(status === "pending", q.reload, 30_000);

  return (
    <>
      <PageHeader title="Reviews" subtitle={`Artists' new releases, new profiles and changes stay hidden from listeners until you approve them.${q.data ? ` ${q.data.pending} waiting.` : ""}`} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select aria-label="Status" value={status} onChange={(e) => (setStatus(e.target.value), setOffset(0))}>
          <option value="pending">Waiting (oldest first)</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="all">All</option>
        </Select>
        <Select aria-label="What" value={subject} onChange={(e) => (setSubject(e.target.value), setOffset(0))}>
          <option value="">Releases and artist profiles</option>
          <option value="release">Releases only</option>
          <option value="profile">Artist profiles only</option>
        </Select>
        <Select aria-label="Kind" value={kind} onChange={(e) => (setKind(e.target.value), setOffset(0))}>
          <option value="">New and changes</option>
          <option value="new">New only</option>
          <option value="update">Changes only</option>
        </Select>
      </div>
      {q.error ? (
        q.error.code === "not_available" ? (
          <Empty>The server cannot review releases or profiles yet. It needs the latest Backend update.</Empty>
        ) : (
          <ErrorBox error={q.error} onRetry={q.reload} />
        )
      ) : !q.data ? (
        <Loading />
      ) : q.data.reviews.length === 0 ? (
        <Empty>{status === "pending" ? "Nothing is waiting for review." : "Nothing here."}</Empty>
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-panel">
            {q.data.reviews.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
          <Pagination total={q.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      )}
    </>
  );
}
