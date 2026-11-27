"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { BlockDialog } from "@/components/Blocks";
import { IMore } from "@/components/icons";
import { Menu } from "@/components/menu";
import { PlayButton } from "@/components/Player";
import { Badge, Button, Card, Empty, ErrorBox, Loading, SearchField, Table, Td, Th } from "@/components/ui";
import { qs } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import type { Taxonomy } from "@/lib/metadata";
import { isArtist, MODE_LABEL, notAvailable, reasonLabel, scoreParts, SLOT_LABEL, type BlockTarget, type Suggestion, type Suggestions } from "@/lib/recommendations";
import type { SearchTrack } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

type Surface = "your_sound" | "mix";
type Seed = { id: string; title: string; artistName?: string };

/**
 * What the engine would offer one listener now, and why. Asked for only when someone wants to see it: looking changes
 * nothing and records nothing.
 */
export function SuggestionsCard({ userId, name }: { userId: string; name: string }) {
  const [surface, setSurface] = useState<Surface | null>(null);
  const [seed, setSeed] = useState<Seed | null>(null);
  const path =
    surface === "your_sound"
      ? `/users/${userId}/recommendations${qs({ surface })}`
      : surface === "mix" && seed
        ? `/users/${userId}/recommendations${qs({ surface, seed: seed.id })}`
        : null;
  const q = useApi<Suggestions>(path);

  return (
    <Card
      title="Suggestions"
      actions={
        <Link href="/recommendations" className="text-xs text-primary-ink hover:underline">
          About recommendations
        </Link>
      }
    >
      <p className="mb-3 text-sm text-muted">
        See what the engine would offer {name} now, and why. Looking changes nothing. The app&apos;s own list can differ, because the order varies from one list to the next.
      </p>
      <div role="group" aria-label="Which list" className="flex flex-wrap gap-2">
        <Button variant={surface === "your_sound" ? "primary" : "secondary"} aria-pressed={surface === "your_sound"} onClick={() => setSurface("your_sound")}>
          Next for Your sound
        </Button>
        <Button variant={surface === "mix" ? "primary" : "secondary"} aria-pressed={surface === "mix"} onClick={() => setSurface("mix")}>
          Mix from a song
        </Button>
      </div>
      {surface === "mix" && <SeedPicker seed={seed} onPick={setSeed} />}
      {path !== null && (
        <div className="mt-4">
          {notAvailable(q.error) ? (
            <p className="text-sm text-muted">The server cannot show suggestions yet. They appear here once it has been updated.</p>
          ) : q.error ? (
            <ErrorBox error={q.error} onRetry={q.reload} />
          ) : !q.data || q.loading ? (
            <Loading />
          ) : (
            <List data={q.data} mix={surface === "mix"} onChanged={q.reload} />
          )}
        </div>
      )}
    </Card>
  );
}

function SeedPicker({ seed, onPick }: { seed: Seed | null; onPick: (s: Seed | null) => void }) {
  const [text, setText] = useState("");
  const term = useDebounced(text.trim());
  const res = useApi<{ tracks: SearchTrack[] }>(!seed && term.length >= 2 ? `/api/search?q=${encodeURIComponent(term)}&limit=8` : null);
  if (seed)
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Starting song:</span>
        <PlayButton track={{ id: seed.id, title: seed.title, artist: seed.artistName }} />
        <span className="font-medium">{seed.title}</span>
        {seed.artistName && <span className="text-muted">{seed.artistName}</span>}
        <Button small onClick={() => onPick(null)}>
          Change
        </Button>
      </div>
    );
  const found = (res.data?.tracks ?? []).filter((t): t is SearchTrack & { id: string } => !!t.id);
  return (
    <div className="mt-3 max-w-md">
      <SearchField aria-label="Search for the starting song" value={text} placeholder="Search for the starting song…" onChange={(e) => setText(e.target.value)} />
      {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
      {term.length >= 2 && res.loading && <Loading rows={2} />}
      {term.length >= 2 && !res.loading && res.data && found.length === 0 && <p className="py-3 text-xs text-muted">No songs found.</p>}
      {term.length >= 2 && !res.loading && (
        <ul className="mt-1 divide-y divide-line">
          {found.map((t) => (
            <li key={t.id}>
              <button type="button" className="w-full rounded-control px-2 py-1.5 text-left hover:bg-sunken" onClick={() => onPick({ id: t.id, title: t.title, artistName: t.artistName })}>
                <span className="block truncate text-sm font-medium">{t.title}</span>
                <span className="block truncate text-[11px] text-muted">{t.artistName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Basis({ data }: { data: Suggestions }) {
  // names for the saved ids; the ids themselves show if the lists cannot be read
  const tax = useApi<Taxonomy>("/taxonomy").data;
  const names = (ids: string[], list: { id: string; label: string }[] | undefined) => ids.map((id) => list?.find((t) => t.id === id)?.label ?? id).join(", ");
  const b = data.basis;
  const facts: [string, string][] = [
    ["Discovery mode", MODE_LABEL[data.discoveryMode] ?? data.discoveryMode],
    ["Prefers", names(b.preferredLanguages, tax?.languages)],
    ["Understands", names(b.understoodLanguages, tax?.languages)],
    ["Regions chosen", names(b.regions, tax?.regions)],
    ["Genres chosen", names(b.genres, tax?.genres)],
    ["Artists", `${b.favouriteArtists} favourite, ${b.followedArtists} followed`],
    ["Songs with history", fmtNum(b.songsWithHistory)],
  ];
  return (
    <>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="shrink-0 text-muted">{k}:</dt>
            <dd className="min-w-0">{v || "None"}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">
        {data.items.length} chosen from {fmtNum(data.candidates)} songs looked at · {data.algorithm}
      </p>
    </>
  );
}

function List({ data, mix, onChanged }: { data: Suggestions; mix: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<BlockTarget | null>(null);
  const familiar = data.items.filter((i) => i.slot === "familiar").length;
  return (
    <div className="space-y-3">
      <Basis data={data} />
      <BlockDialog target={blocking} onClose={() => setBlocking(null)} onBlocked={onChanged} />
      {data.items.length === 0 ? (
        <Empty>
          {mix
            ? "No other songs like this one to put in a mix."
            : "Nothing to add. Your sound needs something of the listener's to go on, and leaves out songs saved, heard in the last 30 days or offered in the last 90."}
        </Empty>
      ) : (
        <>
          <p className="text-sm text-muted">
            {familiar} by artists they know, {data.items.length - familiar} by artists new to them.
          </p>
          <Table>
            <thead>
              <tr>
                <Th className="w-10">#</Th>
                <Th>Song</Th>
                <Th>Place</Th>
                <Th>Why</Th>
                <Th className="text-right">Score</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s, i) => (
                <Fragment key={s.trackId}>
                  <tr>
                    <Td className="tabular-nums text-muted">{i + 1}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <PlayButton track={{ id: s.trackId, title: s.title, artist: s.artistName }} />
                        <div className="min-w-0">
                          <div className="font-medium">{s.title}</div>
                          <div className="text-[11px] text-muted">{s.artistName || "No artist"}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={s.slot === "discovery" ? "purple" : "gray"}>{SLOT_LABEL[s.slot] ?? s.slot}</Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {s.reasons.map((r) => (
                          <Badge key={r}>{reasonLabel(r)}</Badge>
                        ))}
                        {s.reasons.length === 0 && <span className="text-xs text-muted">Nothing in particular</span>}
                      </div>
                    </Td>
                    <Td className="text-right">
                      <Button small aria-expanded={open === s.trackId} aria-label={`Score of ${s.title}: ${s.score.toFixed(2)}. Show its parts`} onClick={() => setOpen(open === s.trackId ? null : s.trackId)}>
                        <span className="tabular-nums">{s.score.toFixed(2)}</span>
                      </Button>
                    </Td>
                    <Td className="text-right">
                      <Menu
                        items={[
                          { label: "Block this song from suggestions", onSelect: () => setBlocking({ kind: "track", id: s.trackId, name: s.title }) },
                          ...(isArtist(s.artistId) ? [{ label: "Block this artist from suggestions", onSelect: () => setBlocking({ kind: "artist", id: s.artistId, name: s.artistName }) }] : []),
                        ]}
                        trigger={({ props }) => (
                          <button {...props} type="button" aria-label={`Actions for ${s.title}`} className="rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink">
                            <IMore size={15} />
                          </button>
                        )}
                      />
                    </Td>
                  </tr>
                  {open === s.trackId && <Parts s={s} />}
                </Fragment>
              ))}
            </tbody>
          </Table>
          <p className="text-xs text-muted">
            Select a score to see its parts. Places are not in score order: some are kept for new artists, one artist is spread out, and the order varies a little.
            {mix ? " A mix's score is mostly likeness to the starting song." : ""}
          </p>
        </>
      )}
    </div>
  );
}

function Parts({ s }: { s: Suggestion }) {
  return (
    <tr>
      <td colSpan={6} className="border-b border-line bg-sunken/50 px-4 py-2">
        <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {scoreParts(s.parts).map((p) => (
            <div key={p.id} className="flex justify-between gap-3">
              <dt className="text-muted">{p.label}</dt>
              <dd className="tabular-nums">{p.value.toFixed(3)}</dd>
            </div>
          ))}
        </dl>
      </td>
    </tr>
  );
}
