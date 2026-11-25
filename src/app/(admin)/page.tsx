"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarList, LineChart } from "@/components/charts";
import { Card, ErrorBox, Loading, PageHeader, Select, Tile } from "@/components/ui";
import { qs } from "@/lib/api";
import { fmtBytes, fmtNum, isoDay } from "@/lib/format";
import type { Metric, Overview, Timeseries, TopList } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const RANGES = [
  { label: "Last 7 days", days: 7, bucket: "day" },
  { label: "Last 30 days", days: 30, bucket: "day" },
  { label: "Last 90 days", days: 90, bucket: "week" },
  { label: "Last 12 months", days: 365, bucket: "week" },
] as const;

function Series({ metric, title, from, to, bucket, color }: { metric: Metric; title: string; from: string; to: string; bucket: string; color?: string }) {
  const q = useApi<Timeseries>(`/stats/timeseries${qs({ metric, from, to, bucket })}`);
  return (
    <Card title={title}>
      {q.error ? <ErrorBox error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : <LineChart points={q.data.points} label={title} color={color} />}
    </Card>
  );
}

export default function Dashboard() {
  const [rangeIdx, setRangeIdx] = useState(1);
  const range = RANGES[rangeIdx]!;
  const { from, to } = useMemo(() => {
    const end = new Date();
    return { from: isoDay(new Date(end.getTime() - (range.days - 1) * 86_400_000)), to: isoDay(end) };
  }, [range.days]);
  const overview = useApi<Overview>("/stats/overview");
  const topArtists = useApi<TopList>(`/stats/top${qs({ kind: "artists", range: "30d", limit: 8 })}`);
  const topTracks = useApi<TopList>(`/stats/top${qs({ kind: "tracks", range: "30d", limit: 8 })}`);
  const o = overview.data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="How Blac Music is doing"
        actions={
          <Select aria-label="Time range" value={rangeIdx} onChange={(e) => setRangeIdx(Number(e.target.value))}>
            {RANGES.map((r, i) => (
              <option key={r.label} value={i}>
                {r.label}
              </option>
            ))}
          </Select>
        }
      />
      {overview.error && <ErrorBox error={overview.error} onRetry={overview.reload} />}
      {!o && !overview.error && <Loading />}
      {o && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Users" value={fmtNum(o.users.total)} sub={`+${fmtNum(o.users.new7d)} this week · ${fmtNum(o.users.banned)} banned`} />
          <Tile label="Artists" value={fmtNum(o.artists.total)} sub={`${fmtNum(o.artists.verified)} verified`} />
          <Tile label="Releases" value={fmtNum(o.releases.total)} sub={`${fmtNum(o.releases.public)} public · ${fmtNum(o.releases.takenDown)} taken down`} />
          <Tile label="Tracks" value={fmtNum(o.tracks.total)} sub={`${fmtNum(o.shows.total)} podcast shows`} />
          <Tile label="Streams (30 days)" value={fmtNum(o.plays.last30d)} sub={`${fmtNum(o.plays.last7d)} in the last 7 days`} />
          <Tile label="Listeners (30 days)" value={fmtNum(o.plays.uniqueListeners30d)} />
          <Tile label="Streams (all time)" value={fmtNum(o.plays.total)} />
          <Tile label="Storage used" value={fmtBytes(o.storageBytes)} />
        </div>
      )}
      {o && o.artists.pendingVerification > 0 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {o.artists.pendingVerification} verification request{o.artists.pendingVerification === 1 ? "" : "s"} waiting.{" "}
          <Link href="/verifications" className="font-medium underline">
            Review now
          </Link>
        </div>
      )}
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Series metric="signups" title="New users" from={from} to={to} bucket={range.bucket} />
        <Series metric="plays" title="Streams" from={from} to={to} bucket={range.bucket} color="#0f766e" />
        <Series metric="artists" title="New artists" from={from} to={to} bucket={range.bucket} color="#b45309" />
        <Series metric="releases" title="New releases" from={from} to={to} bucket={range.bucket} color="#1d4ed8" />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card title="Top artists (30 days)">
          {topArtists.error ? <ErrorBox error={topArtists.error} onRetry={topArtists.reload} /> : !topArtists.data ? <Loading /> : <BarList items={topArtists.data.items.map((i) => ({ id: i.id, name: i.name, value: i.plays }))} />}
        </Card>
        <Card title="Top tracks (30 days)">
          {topTracks.error ? <ErrorBox error={topTracks.error} onRetry={topTracks.reload} /> : !topTracks.data ? <Loading /> : <BarList items={topTracks.data.items.map((i) => ({ id: i.id, name: i.name, value: i.plays }))} />}
        </Card>
      </div>
    </>
  );
}
