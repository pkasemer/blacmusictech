"use client";

import Link from "next/link";
import { useState } from "react";
import { VisibilityBadge } from "@/components/badges";
import { IArrowDown, IArrowUp, IStar } from "@/components/icons";
import { useToast } from "@/components/Shell";
import { Button, Empty, ErrorBox, IconButton, Loading, PageHeader, Table, Td, Th } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { move } from "@/lib/combine";
import { featureError, featuredSupported } from "@/lib/featured";
import type { ReleaseList } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function FeaturedPage() {
  const q = useApi<ReleaseList>("/releases?featured=true&limit=100");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const supported = !q.data || featuredSupported(q.data);
  const rows = q.data && supported ? q.data.releases : [];
  // reordering sends the whole list, so it needs all of it
  const complete = !!q.data && q.data.total <= rows.length;

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast(done);
    } catch (e) {
      toast(e instanceof ApiError ? featureError(e.code, e.message) : "Could not save.", "error");
    } finally {
      setBusy(false);
      q.reload();
    }
  }

  return (
    <>
      <PageHeader title="Featured releases" subtitle="The albums and EPs the app features, in this order. To add one, open it and choose Feature." />
      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}
      {!q.data && !q.error && <Loading />}
      {!supported && <Empty icon={<IStar size={20} />}>Featured releases are not available on the server yet. They appear here once it has been updated.</Empty>}
      {q.data && supported && rows.length === 0 && (
        <Empty icon={<IStar size={20} />}>
          Nothing is featured yet. Open an album or EP under{" "}
          <Link href="/releases" className="text-primary hover:underline">
            Releases
          </Link>{" "}
          and choose Feature.
        </Empty>
      )}
      {rows.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th className="w-12">#</Th>
              <Th>Release</Th>
              <Th>State</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <Td className="tabular-nums text-muted">{i + 1}</Td>
                <Td>
                  <Link href={`/releases/${r.id}`} className="font-medium hover:text-primary">
                    {r.title}
                  </Link>
                  <div className="text-xs text-muted">{r.artistName}</div>
                </Td>
                <Td>
                  <VisibilityBadge v={r.visibility} takenDown={r.takenDown} />
                  {r.visibility !== "public" && <span className="ml-2 text-xs text-muted">listeners see it once it is public</span>}
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    {([-1, 1] as const).map((by) => (
                      <IconButton
                        key={by}
                        small
                        label={`Move ${r.title} ${by < 0 ? "up" : "down"}`}
                        disabled={busy || !complete || (by < 0 ? i === 0 : i === rows.length - 1)}
                        onClick={() => void run(() => api("/featured-releases/order", { method: "PUT", body: { releaseIds: move(rows.map((x) => x.id), i, by) } }), "Order saved")}
                      >
                        {by < 0 ? <IArrowUp size={14} /> : <IArrowDown size={14} />}
                      </IconButton>
                    ))}
                    <Button small disabled={busy} aria-label={`Remove ${r.title} from featured`} onClick={() => void run(() => api(`/releases/${r.id}/featured`, { method: "DELETE" }), "Removed from featured")}>
                      Remove
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
