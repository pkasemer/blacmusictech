"use client";

import Link from "next/link";
import { useState } from "react";
import { ReasonDialog } from "@/components/Dialogs";
import { useToast } from "@/components/Shell";
import { Badge, Button, Card, Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { ArtistList, ArtistRow } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Tab = "pending" | "flagged";

export default function VerificationsPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const list = useApi<ArtistList>(`/artists${qs({ status: tab, limit: 100 })}`);
  const toast = useToast();
  const [target, setTarget] = useState<{ a: ArtistRow; decision: "approve" | "reject" } | null>(null);

  return (
    <>
      <PageHeader title="Verifications" subtitle="Artists asking for the verified badge, oldest first" />
      <div role="tablist" aria-label="Queue" className="mb-4 flex gap-2">
        {(["pending", "flagged"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-brand text-white" : "border border-line bg-white text-muted hover:text-ink"}`}
          >
            {t === "pending" ? "Pending requests" : "Flagged names"}
          </button>
        ))}
      </div>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data && list.data.artists.length === 0 && <Empty>{tab === "pending" ? "No verification requests are waiting." : "No flagged artists."}</Empty>}
      <div className="space-y-3">
        {list.data?.artists.map((a) => (
          <Card key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/artists/${a.id}`} className="text-base font-semibold hover:underline">
                    {a.name}
                  </Link>
                  {a.flagged && <Badge tone="amber">Name matches a verified artist</Badge>}
                  {a.banned && <Badge tone="red">Banned</Badge>}
                </div>
                <div className="mt-0.5 text-sm text-muted">
                  {a.ownerEmail ?? "No account"} · {a.releaseCount} release{a.releaseCount === 1 ? "" : "s"} · {a.followerCount.toLocaleString()} followers
                  {a.requestedAt && <> · requested {fmtDateTime(a.requestedAt)}</>}
                </div>
                <blockquote className="mt-3 whitespace-pre-wrap rounded-md bg-canvas px-3 py-2 text-sm">{a.verificationMessage || <span className="text-muted">The artist left no message.</span>}</blockquote>
              </div>
              {a.verification === "pending" || (a.verification === undefined && a.status === "pending") ? (
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => setTarget({ a, decision: "approve" })}>
                    Approve
                  </Button>
                  <Button variant="danger" onClick={() => setTarget({ a, decision: "reject" })}>
                    Reject
                  </Button>
                </div>
              ) : (
                <Link href={`/artists/${a.id}`} className="text-sm text-brand hover:underline">
                  Open profile
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>

      <ReasonDialog
        open={!!target}
        title={target?.decision === "approve" ? `Verify ${target.a.name}?` : `Reject ${target?.a.name ?? ""}?`}
        description={target?.decision === "approve" ? "The artist gets the verified badge." : "The artist sees your reason, so write it for them."}
        confirmLabel={target?.decision === "approve" ? "Approve" : "Reject"}
        reasonLabel={target?.decision === "approve" ? "Note (optional)" : "Reason shown to the artist"}
        required={target?.decision === "reject"}
        danger={target?.decision === "reject"}
        onClose={() => setTarget(null)}
        onSubmit={async (note) => {
          if (!target) return;
          await api(`/artists/${target.a.id}/verification`, { method: "POST", body: { decision: target.decision, note } });
          toast(target.decision === "approve" ? "Artist verified" : "Verification rejected");
          list.reload();
        }}
      />
    </>
  );
}
