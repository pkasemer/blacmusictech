"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { BarList, LineChart } from "@/components/charts";
import { ICheck, IActivity, IArrowUp, IAlert, IBan, IClock, IDisc, IEnter, IMic, IPlaylist, IPlus, ISearch, IShield, ITrend, IUsers } from "@/components/icons";
import { useSession } from "@/components/Shell";
import { Avatar, Badge, Button, Card, Empty, ErrorBox, Kbd, Loading, PageHeader, Select, Tile } from "@/components/ui";
import { qs } from "@/lib/api";
import { actionLabel, fmtBytes, fmtDateTime, fmtNum, isoDay } from "@/lib/format";
import { recents } from "@/lib/listStore";
import type { ProcessingList } from "@/lib/processing";
import type { ArtistList, AuditList, Metric, Overview, Timeseries, TopList } from "@/lib/types";
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
      {q.error ? <ErrorBox error={q.error} onRetry={q.reload} /> : !q.data ? <Loading rows={3} /> : <LineChart points={q.data.points} label={title} color={color} />}
    </Card>
  );
}

function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function Attention({ href, icon, count, label, tone }: { href: string; icon: ReactNode; count: number; label: string; tone: "amber" | "red" | "blue" }) {
  if (count <= 0) return null;
  const c = { amber: "text-warning-ink bg-warning/15", red: "text-danger-ink bg-danger/10", blue: "text-primary-ink bg-primary/10" }[tone];
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-control border border-line bg-panel px-3 py-2 text-sm hover:border-[#d4d4da]">
      <span className={`flex size-7 items-center justify-center rounded-md ${c}`}>{icon}</span>
      <span>
        <span className="font-semibold tabular-nums">{fmtNum(count)}</span> <span className="text-muted">{label}</span>
      </span>
    </Link>
  );
}

export default function Dashboard() {
  const session = useSession();
  const [rangeIdx, setRangeIdx] = useState(1);
  // the hour is read in the browser only, so the server render and the first client render agree
  const hello = useSyncExternalStore(
    () => () => {},
    () => greeting(new Date().getHours()),
    () => "Welcome back",
  );
  const range = RANGES[rangeIdx]!;
  const { from, to } = useMemo(() => {
    const end = new Date();
    return { from: isoDay(new Date(end.getTime() - (range.days - 1) * 86_400_000)), to: isoDay(end) };
  }, [range.days]);

  const overview = useApi<Overview>("/stats/overview");
  const pending = useApi<ArtistList>(`/artists${qs({ status: "pending", limit: 5 })}`);
  const activity = useApi<AuditList>(`/audit-log${qs({ limit: 7 })}`);
  const topArtists = useApi<TopList>(`/stats/top${qs({ kind: "artists", range: "30d", limit: 6 })}`);
  const topTracks = useApi<TopList>(`/stats/top${qs({ kind: "tracks", range: "30d", limit: 6 })}`);
  const processing = useApi<ProcessingList>("/processing");
  const stuck = processing.data?.counts.stuck ?? 0;
  const recent = recents.use();
  const o = overview.data;
  const first = session?.user.displayName.split(" ")[0] ?? "";

  return (
    <>
      <PageHeader
        title={`${hello}${first ? `, ${first}` : ""}`}
        subtitle="Here is what is happening across Blac Music."
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

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/releases/new">
          <Button variant="primary">
            <IPlus size={14} /> New release
          </Button>
        </Link>
        <Link href="/playlists?new=1">
          <Button>
            <IPlus size={14} /> New playlist
          </Button>
        </Link>
        <Link href="/sections?new=1">
          <Button>
            <IPlus size={14} /> New section
          </Button>
        </Link>
        <Link href="/search-insights">
          <Button>
            <ISearch size={14} /> What people search
          </Button>
        </Link>
        <span className="ml-auto hidden items-center gap-1.5 self-center text-xs text-muted md:flex">
          Jump anywhere <Kbd>Ctrl K</Kbd>
        </span>
      </div>

      {overview.error && <ErrorBox error={overview.error} onRetry={overview.reload} />}
      {!o && !overview.error && <Loading rows={2} />}
      {o && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {stuck > 0 && <Attention href="/processing" icon={<IAlert size={14} />} count={stuck} label={stuck === 1 ? "song stuck: retry it" : "songs stuck: retry them"} tone="red" />}
            {o.reviews && <Attention href="/reviews" icon={<ICheck size={14} />} count={o.reviews.pending} label="releases and profiles waiting for review" tone="amber" />}
            <Attention href="/verifications" icon={<IShield size={14} />} count={o.artists.pendingVerification} label="verification requests waiting" tone="amber" />
            <Attention href="/users?status=banned" icon={<IBan size={14} />} count={o.users.banned} label="banned users" tone="red" />
            <Attention href="/releases?takenDown=true" icon={<IAlert size={14} />} count={o.releases.takenDown} label="releases taken down" tone="red" />
            <Attention href="/releases?visibility=scheduled" icon={<IClock size={14} />} count={o.releases.scheduled} label="releases scheduled" tone="blue" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Users" value={fmtNum(o.users.total)} sub={`+${fmtNum(o.users.new7d)} this week`} icon={<IUsers size={15} />} href="/users" />
            <Tile label="Artists" value={fmtNum(o.artists.total)} sub={`${fmtNum(o.artists.verified)} verified`} icon={<IMic size={15} />} href="/artists" />
            <Tile label="Releases" value={fmtNum(o.releases.total)} sub={`${fmtNum(o.releases.public)} public`} icon={<IDisc size={15} />} href="/releases" />
            <Tile label="Tracks" value={fmtNum(o.tracks.total)} sub={`${fmtNum(o.shows.total)} podcast shows`} icon={<IPlaylist size={15} />} />
            <Tile label="Streams (30 days)" value={fmtNum(o.plays.last30d)} sub={`${fmtNum(o.plays.last7d)} in the last 7 days`} icon={<ITrend size={15} />} />
            <Tile label="Listeners (30 days)" value={fmtNum(o.plays.uniqueListeners30d)} icon={<IUsers size={15} />} />
            <Tile label="Streams (all time)" value={fmtNum(o.plays.total)} icon={<IActivity size={15} />} />
            <Tile label="Storage used" value={fmtBytes(o.storageBytes)} sub="See server storage and load" icon={<IArrowUp size={15} />} href="/server" />
          </div>
        </>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card title="Needs your review" actions={<Link href="/verifications" className="text-xs text-primary hover:underline">View all</Link>}>
          {pending.error ? (
            <ErrorBox error={pending.error} onRetry={pending.reload} />
          ) : !pending.data ? (
            <Loading rows={3} />
          ) : pending.data.artists.length === 0 ? (
            <Empty icon={<IShield size={20} />}>No verification requests are waiting.</Empty>
          ) : (
            <ul className="-my-1 divide-y divide-line">
              {pending.data.artists.map((a) => (
                <li key={a.id}>
                  <Link href={`/artists/${a.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                    <Avatar name={a.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      <span className="block truncate text-[11px] text-muted">{a.ownerEmail ?? "No account"}{a.requestedAt ? ` · requested ${fmtDateTime(a.requestedAt)}` : ""}</span>
                    </span>
                    {a.flagged && <Badge tone="amber">Name match</Badge>}
                    <IEnter size={14} className="text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent activity" actions={<Link href="/audit-log" className="text-xs text-primary hover:underline">Audit log</Link>}>
          {activity.error ? (
            <ErrorBox error={activity.error} onRetry={activity.reload} />
          ) : !activity.data ? (
            <Loading rows={4} />
          ) : activity.data.entries.length === 0 ? (
            <Empty>No activity yet.</Empty>
          ) : (
            <ul className="-my-1 divide-y divide-line">
              {activity.data.entries.map((e) => (
                <li key={e.id} className="flex items-start gap-3 py-2.5">
                  <Avatar name={e.actor.email} size={24} />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate">
                      <span className="font-medium capitalize">{actionLabel(e.action)}</span>
                      <span className="text-muted"> · {e.targetLabel || e.targetId}</span>
                    </div>
                    <div className="truncate text-[11px] text-muted">
                      {e.actor.email} · {fmtDateTime(e.at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Series metric="signups" title="New users" from={from} to={to} bucket={range.bucket} color="#1688f8" />
        <Series metric="plays" title="Streams" from={from} to={to} bucket={range.bucket} color="#0d9488" />
        <Series metric="artists" title="New artists" from={from} to={to} bucket={range.bucket} color="#8b5cf6" />
        <Series metric="releases" title="New releases" from={from} to={to} bucket={range.bucket} color="#fe5f1e" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Top artists (30 days)">
          {topArtists.error ? <ErrorBox error={topArtists.error} onRetry={topArtists.reload} /> : !topArtists.data ? <Loading rows={3} /> : <BarList items={topArtists.data.items.map((i) => ({ id: i.id, name: i.name, value: i.plays }))} />}
        </Card>
        <Card title="Top tracks (30 days)">
          {topTracks.error ? <ErrorBox error={topTracks.error} onRetry={topTracks.reload} /> : !topTracks.data ? <Loading rows={3} /> : <BarList items={topTracks.data.items.map((i) => ({ id: i.id, name: i.name, value: i.plays }))} />}
        </Card>
        <Card title="Recently opened">
          {recent.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Pages you open show up here.</p>
          ) : (
            <ul className="-my-1 divide-y divide-line">
              {recent.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="flex items-center gap-2.5 py-2 text-sm hover:text-primary">
                    <IClock size={14} className="text-faint" />
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span className="text-[11px] capitalize text-faint">{r.kind}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
