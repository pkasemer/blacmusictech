"use client";

import Link from "next/link";
import { useState } from "react";
import { BlocksCard } from "@/components/Blocks";
import { Card, Empty, ErrorBox, Loading, PageHeader, Progress, Select, Table, Td, Th, Tile } from "@/components/ui";
import { qs } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import { coverage, FEW_LISTENS, gaps, notAvailable, shareOfListened, shownPercent, SLOT_LABEL, SURFACE_LABEL, type Outcomes, type Readiness } from "@/lib/recommendations";
import { useApi } from "@/lib/useApi";

const RANGES = [7, 14, 30, 90];

function Older() {
  return (
    <Card>
      <p className="text-sm text-muted">The server cannot report on recommendations yet. This appears once it has been updated.</p>
    </Card>
  );
}

function ReadinessSection() {
  const q = useApi<Readiness>("/recommendations/readiness");
  if (notAvailable(q.error)) return <Older />;
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const { songs, listeners } = q.data;
  const missing = gaps(songs);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Playable songs" value={fmtNum(songs.playable)} sub="What the engine can suggest" />
        <Tile label="Accounts counted" value={fmtNum(listeners.counted)} sub={`${fmtNum(listeners.leftOut)} staff or test left out`} href="/users" />
        <Tile label="With set-up choices" value={fmtNum(listeners.withChoices)} sub="Chose languages, genres or artists" />
        <Tile label="Heard 10 songs or more" value={fmtNum(listeners.heardTenSongs)} sub="From listening events, last 180 days" />
      </div>
      <Card title="How much the catalogue says about its songs" className="mt-4">
        {missing.length > 0 && (
          <ul role="status" className="mb-4 space-y-1 rounded-control border border-line bg-warning/15 px-3 py-2 text-sm text-warning-ink">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        <ul className="space-y-3">
          {coverage(songs).map((c) => (
            <li key={c.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span>
                  {c.label}
                  {c.href && c.count < c.total && (
                    <Link href={c.href} className="ml-2 text-xs text-primary-ink hover:underline">
                      Review
                    </Link>
                  )}
                </span>
                <span className="tabular-nums text-muted">
                  {fmtNum(c.count)} of {fmtNum(c.total)} · {shownPercent(c)}
                </span>
              </div>
              <div className="mt-1.5">
                <Progress value={c.percent} label={`${c.label}: ${shownPercent(c)}`} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Language, region, culture and sound count only once verified. Genre counts as uploaded unless it is rejected. Add only what you know; nothing is worked out from the artist.
        </p>
      </Card>
    </>
  );
}

function OutcomesSection() {
  const [days, setDays] = useState(14);
  const q = useApi<Outcomes>(`/recommendations/outcomes${qs({ days })}`);
  return (
    <Card
      title="What listeners did with suggestions"
      className="mt-4"
      actions={
        <Select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {RANGES.map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </Select>
      }
    >
      {notAvailable(q.error) ? (
        <p className="text-sm text-muted">The server cannot report this yet.</p>
      ) : q.error ? (
        <ErrorBox error={q.error} onRetry={q.reload} />
      ) : !q.data || q.loading ? (
        <Loading rows={3} />
      ) : q.data.rows.length === 0 ? (
        <Empty>No suggestions to count in this period. Lists made for staff and test accounts are left out.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Where · version</Th>
              <Th>Place</Th>
              <Th className="!px-2 text-right">Suggested</Th>
              <Th className="!px-2 text-right">Listened</Th>
              <Th className="!px-2 text-right">Completed</Th>
              <Th className="!px-2 text-right">Skipped</Th>
              <Th className="!px-2 text-right">Kept</Th>
              <Th className="!px-2 text-right">Listeners</Th>
            </tr>
          </thead>
          <tbody>
            {q.data.rows.map((r) => (
              <tr key={`${r.surface}-${r.algorithm}-${r.slot}`}>
                <Td className="whitespace-nowrap">
                  <div className="font-medium">{SURFACE_LABEL[r.surface] ?? r.surface}</div>
                  <div className="text-[11px] text-muted">{r.algorithm}</div>
                </Td>
                <Td>{SLOT_LABEL[r.slot] ?? r.slot}</Td>
                <Td className="!px-2 text-right tabular-nums">{fmtNum(r.suggested)}</Td>
                <Td className="!px-2 text-right tabular-nums">{fmtNum(r.listened)}</Td>
                <Td className="!px-2 text-right tabular-nums">{shareOfListened(r.completed, r.listened)}</Td>
                <Td className="!px-2 text-right tabular-nums">{shareOfListened(r.skipped, r.listened)}</Td>
                <Td className="!px-2 text-right tabular-nums">{fmtNum(r.kept)}</Td>
                <Td className="!px-2 text-right tabular-nums">{fmtNum(r.listeners)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="mt-3 text-xs text-muted">
        Kept means the song was then liked or added to a playlist. Completed and skipped are shares of the songs listened to; under {FEW_LISTENS} listens the counts are shown. A suggestion nobody played may never have been reached, so it is not a
        rejection. Listens count within 48 hours, or 7 days for Your sound. Older apps cannot say where a song was played from, so any listen of it counts; recent lists may still be acted on.
      </p>
    </Card>
  );
}

export default function RecommendationsPage() {
  return (
    <>
      <PageHeader title="Recommendations" subtitle="How Blac chooses songs for Start mix, autoplay and Your sound, and what there is to choose with." />
      <ReadinessSection />
      <OutcomesSection />
      <BlocksCard />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="What shapes a suggestion">
          <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted">
            <li>What the listener chose at set-up, and the artists they follow.</li>
            <li>What they finish, replay, skip, like, save and add to playlists.</li>
            <li>The song&apos;s genre and its verified details. A mix never leaves the starting song&apos;s genre family.</li>
            <li>How songs do with listeners as a whole, with staff and test accounts left out.</li>
            <li>Their discovery mode sets how many places go to artists new to them. One artist cannot fill a list.</li>
          </ul>
          <p className="mt-3 text-xs text-muted">It does not compare similar listeners or analyse the audio.</p>
        </Card>
        <Card title="Why would someone get a song?">
          <p className="text-sm text-muted">
            Open a person under{" "}
            <Link href="/users" className="text-primary-ink hover:underline">
              Users
            </Link>{" "}
            and use <strong className="text-ink">Suggestions</strong> to see what the engine would offer them now, with the reasons and the score of each song.
          </p>
        </Card>
      </div>
    </>
  );
}
