"use client";

import { useMemo, useState } from "react";
import { BarList, LineChart } from "@/components/charts";
import { Badge, Card, Empty, ErrorBox, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th, Tile } from "@/components/ui";
import { qs } from "@/lib/api";
import { fmtDateTime, fmtNum, isoDay } from "@/lib/format";
import type { SearchGapList, SearchKinds, SearchOverview, SearchRange, SearchTopList, Timeseries } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

const RANGES: { value: SearchRange; label: string; days: number; bucket: "day" | "week" }[] = [
  { value: "7d", label: "Last 7 days", days: 7, bucket: "day" },
  { value: "30d", label: "Last 30 days", days: 30, bucket: "day" },
  { value: "90d", label: "Last 90 days", days: 90, bucket: "week" },
];
const KINDS = [
  { value: "", label: "Everything" },
  { value: "tracks", label: "Songs" },
  { value: "artists", label: "Artists" },
  { value: "playlists", label: "Playlists" },
  { value: "albums", label: "Albums" },
];
const LIMIT = 20;

/** "+12%" / "-5%" / "new" compared with the period before. */
function change(cur: number, prev: number): { text: string; tone: "green" | "red" | "gray" | "blue" } {
  if (prev <= 0) return cur > 0 ? { text: "new", tone: "blue" } : { text: "–", tone: "gray" };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { text: "0%", tone: "gray" };
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, tone: pct > 0 ? "green" : "red" };
}

function Delta({ cur, prev, goodWhenDown }: { cur: number; prev: number; goodWhenDown?: boolean }) {
  const c = change(cur, prev);
  const tone = c.tone === "green" && goodWhenDown ? "red" : c.tone === "red" && goodWhenDown ? "green" : c.tone;
  return <Badge tone={tone}>{c.text}</Badge>;
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-1.5 w-24 rounded bg-canvas" aria-hidden="true">
      <div className="h-1.5 rounded bg-brand" style={{ width: `${Math.max(3, (value / Math.max(1, max)) * 100)}%` }} />
    </div>
  );
}

export default function SearchInsightsPage() {
  const [range, setRange] = useState<SearchRange>("30d");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const term = useDebounced(q);
  const cfg = RANGES.find((r) => r.value === range)!;
  const { from, to } = useMemo(() => {
    const end = new Date();
    return { from: isoDay(new Date(end.getTime() - (cfg.days - 1) * 86_400_000)), to: isoDay(end) };
  }, [cfg.days]);

  const overview = useApi<SearchOverview>(`/search/overview${qs({ range })}`);
  const series = useApi<Timeseries>(`/stats/timeseries${qs({ metric: "searches", from, to, bucket: cfg.bucket })}`);
  const gapsSeries = useApi<Timeseries>(`/stats/timeseries${qs({ metric: "searches_no_results", from, to, bucket: cfg.bucket })}`);
  const top = useApi<SearchTopList>(`/search/top${qs({ range, kind, q: term, limit: LIMIT, offset })}`);
  const rising = useApi<SearchTopList>(`/search/top${qs({ range, kind, sort: "rising", limit: 8 })}`);
  const kinds = useApi<SearchKinds>(`/search/kinds${qs({ range })}`);
  const gaps = useApi<SearchGapList>(`/search/no-results${qs({ range, kind, limit: 10 })}`);
  const o = overview.data;
  const max = top.data?.items[0]?.count ?? 1;

  return (
    <>
      <PageHeader
        title="Search insights"
        subtitle="What listeners look for in the app. Use it to see what content to add, what to feature, and what people cannot find."
        actions={
          <div className="flex gap-2">
            <Select aria-label="Type" value={kind} onChange={(e) => (setKind(e.target.value), setOffset(0))}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
            <Select aria-label="Time range" value={range} onChange={(e) => (setRange(e.target.value as SearchRange), setOffset(0))}>
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      {overview.error && <ErrorBox error={overview.error} onRetry={overview.reload} />}
      {!o && !overview.error && <Loading />}
      {o && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Searches" value={fmtNum(o.searches)} sub={`${change(o.searches, o.previous.searches).text} vs the period before`} />
          <Tile label="Different searches" value={fmtNum(o.uniqueQueries)} />
          <Tile label="Found nothing" value={fmtNum(o.noResultSearches)} sub={`${change(o.noResultSearches, o.previous.noResultSearches).text} vs the period before`} tone={o.noResultRate > 0.15 ? "warn" : undefined} />
          <Tile label="Share with no result" value={`${(o.noResultRate * 100).toFixed(1)}%`} sub="of all searches" tone={o.noResultRate > 0.15 ? "warn" : undefined} />
        </div>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card title="Searches over time">
          {series.error ? <ErrorBox error={series.error} onRetry={series.reload} /> : !series.data ? <Loading /> : <LineChart points={series.data.points} label="Searches" color="#6d28d9" />}
        </Card>
        <Card title="Searches that found nothing">
          {gapsSeries.error ? <ErrorBox error={gapsSeries.error} onRetry={gapsSeries.reload} /> : !gapsSeries.data ? <Loading /> : <LineChart points={gapsSeries.data.points} label="No result" color="#b91c1c" />}
        </Card>
      </div>

      <div className="mt-6">
        <Card title="What people look for">
          {kinds.error ? (
            <ErrorBox error={kinds.error} onRetry={kinds.reload} />
          ) : !kinds.data ? (
            <Loading />
          ) : (
            <BarList items={kinds.data.items.map((k) => ({ id: k.kind, name: KINDS.find((x) => x.value === k.kind)?.label ?? k.kind, value: k.count }))} empty="No searches yet." />
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card title="Rising: growing fastest">
          {rising.error ? (
            <ErrorBox error={rising.error} onRetry={rising.reload} />
          ) : !rising.data ? (
            <Loading />
          ) : rising.data.items.length === 0 ? (
            <p className="text-sm text-muted">Nothing is rising yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {rising.data.items.map((r) => (
                <li key={r.query} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate font-medium">{r.query}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums text-muted">{fmtNum(r.count)}</span>
                    <Delta cur={r.count} prev={r.previousCount} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Content gaps: searched, nothing found">
          {gaps.error ? (
            <ErrorBox error={gaps.error} onRetry={gaps.reload} />
          ) : !gaps.data ? (
            <Loading />
          ) : gaps.data.items.length === 0 ? (
            <p className="text-sm text-muted">Every search found something.</p>
          ) : (
            <>
              <ul className="divide-y divide-line text-sm">
                {gaps.data.items.map((r) => (
                  <li key={r.query} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate font-medium">{r.query}</span>
                    <span className="shrink-0 tabular-nums text-muted" title={`last searched ${fmtDateTime(r.lastAt)}`}>
                      {fmtNum(r.count)} search{r.count === 1 ? "" : "es"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">These are things listeners wanted and could not find: good candidates for new content, playlists or sections.</p>
            </>
          )}
        </Card>
      </div>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Top searches</h2>
      <div className="mb-3">
        <Input aria-label="Search the list" className="max-w-xs" placeholder="Filter by words" value={q} onChange={(e) => (setQ(e.target.value), setOffset(0))} />
      </div>
      {top.error && <ErrorBox error={top.error} onRetry={top.reload} />}
      {!top.data && !top.error && <Loading />}
      {top.data && top.data.items.length === 0 && <Empty>No searches match.</Empty>}
      {top.data && top.data.items.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Search</Th>
                <Th>Searches</Th>
                <Th />
                <Th>Change</Th>
                <Th>Found nothing</Th>
              </tr>
            </thead>
            <tbody>
              {top.data.items.map((r) => (
                <tr key={r.query}>
                  <Td className="font-medium">{r.query}</Td>
                  <Td className="tabular-nums">{fmtNum(r.count)}</Td>
                  <Td>
                    <Bar value={r.count} max={max} />
                  </Td>
                  <Td>
                    <Delta cur={r.count} prev={r.previousCount} />
                  </Td>
                  <Td>{r.noResultCount > 0 ? <Badge tone={r.noResultCount >= r.count * 0.5 ? "red" : "amber"}>{Math.round((r.noResultCount / r.count) * 100)}%</Badge> : <span className="text-muted">0%</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination total={top.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      )}
      <p className="mt-4 text-xs text-muted">Searches are counted without the person who made them. Only the words and the number of results are kept, for 6 months.</p>
    </>
  );
}
