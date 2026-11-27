"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { MultiSelect } from "@/components/MultiSelect";
import { MetadataReview } from "@/components/MetadataReview";
import { MetadataStatusBadge, ProvenanceBadge } from "@/components/metadata-parts";
import { usePageTitle } from "@/components/page-meta";
import { useToast } from "@/components/Shell";
import { Button, Card, ErrorBox, KV, Loading, PageHeader, Select, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtDuration } from "@/lib/format";
import { ATTRIBUTES, REQUIRED_LABEL, metadataError, offered, payload, sameDraft, setLanguageRole, setPrimaryGenre, setUnknownLanguage, supportsReview, termLabel, toDraft, withGenres, withLanguages, type Draft, type LanguageRole, type Linked, type ReleaseMetadata, type Taxonomy, type Term, type TrackMetadata } from "@/lib/metadata";
import { confirmLeave, useUnsavedGuard } from "@/lib/unsaved";
import { useApi } from "@/lib/useApi";

export default function TrackMetadataPage() {
  const { id, trackId } = useParams<{ id: string; trackId: string }>();
  const q = useApi<ReleaseMetadata>(`/releases/${id}/track-metadata`);
  const tax = useApi<Taxonomy>("/taxonomy");
  // the answer to the last save, shown until the list has been read again
  const [saved, setSaved] = useState<{ track: TrackMetadata; over: ReleaseMetadata | undefined }>();
  const listed = q.data?.releaseId === id ? q.data.tracks.find((t) => t.trackId === trackId) : undefined;
  const track = saved && saved.over === q.data && saved.track.trackId === trackId ? saved.track : listed;
  usePageTitle(track ? `Metadata: ${track.title}` : undefined, "release");

  const error = q.error ?? tax.error;
  if (error) return <ErrorBox error={error.code === "not_available" ? "Track metadata is not available on the server yet." : error} onRetry={() => (q.reload(), tax.reload())} />;
  if (!q.data || !tax.data) return <Loading />;
  if (!track)
    return (
      <ErrorBox
        error="This track is not on this release."
        onRetry={q.reload}
      />
    );
  return (
    <Editor
      key={`${track.trackId}|${track.version}`}
      track={track}
      tracks={q.data.tracks}
      tax={tax.data}
      onSaved={(m) => {
        setSaved({ track: m, over: q.data });
        q.reload();
      }}
      onReload={() => {
        setSaved(undefined);
        q.reload();
        tax.reload();
      }}
    />
  );
}

function Section({ n, title, hint, children, className }: { n: number; title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <Card title={`${n}. ${title}`} className={className}>
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      {children}
    </Card>
  );
}

function Editor({ track, tracks, tax, onSaved, onReload }: { track: TrackMetadata; tracks: TrackMetadata[]; tax: Taxonomy; onSaved: (m: TrackMetadata) => void; onReload: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const original = toDraft(track);
  const [draft, setDraft] = useState<Draft>(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string }>();
  const dirty = !sameDraft(draft, original);
  useUnsavedGuard(dirty);
  const index = tracks.findIndex((t) => t.trackId === track.trackId);
  const prev = tracks[index - 1];
  const next = tracks[index + 1];
  const href = (t: TrackMetadata) => `/releases/${track.release.id}/tracks/${t.trackId}`;
  const go = (to: string) => {
    if (confirmLeave()) router.push(to);
  };

  async function save(thenNext: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      if (dirty) {
        const m = await api<TrackMetadata>(`/tracks/${track.trackId}/metadata`, { method: "PUT", body: payload(draft, track.version) });
        toast(`Saved "${track.title}"`);
        onSaved(m);
      }
      if (thenNext && next) router.push(href(next));
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "error", "Could not save.");
      setError({ code: err.code, message: metadataError(err.code, err.status, err.message) });
    } finally {
      setBusy(false);
    }
  }

  const reviewable = supportsReview(track);

  const saved = (list: Linked[], id: string) => list.find((x) => x.id === id);
  const picker = (label: string, terms: Term[], chosen: string[], history: Linked[], onChange: (ids: string[]) => void) => (
    <MultiSelect
      label={label}
      options={offered(terms, chosen).map((t) => ({ id: t.id, label: termLabel(terms, t.id) }))}
      value={chosen}
      onChange={onChange}
      extra={(tid) => <ProvenanceBadge p={saved(history, tid)} />}
      emptyText="Not classified"
    />
  );
  const groupLabel = (gid: string | null) => tax.languageGroups.find((g) => g.id === gid)?.label ?? "Other";

  return (
    <>
      <PageHeader
        title={track.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <MetadataStatusBadge status={track.status} />
            <span>
              Track {index + 1} of {tracks.length} on{" "}
              <Link href={`/releases/${track.release.id}`} className="text-primary hover:underline">
                {track.release.title}
              </Link>
            </span>
          </span>
        }
        actions={
          <>
            <Button onClick={() => go(`${href(track)}/lyrics`)}>Lyrics</Button>
            <Button disabled={!prev} onClick={() => prev && go(href(prev))}>
              Previous
            </Button>
            <Button disabled={!next} onClick={() => next && go(href(next))}>
              Next
            </Button>
          </>
        }
      />
      <nav aria-label="Tracks of this release" className="mb-4 flex flex-wrap gap-1.5">
        {tracks.map((t, i) => (
          <Link key={t.trackId} href={href(t)} aria-current={t.trackId === track.trackId ? "page" : undefined} title={t.title} className={cx("max-w-44 truncate rounded-control border px-2.5 py-1 text-xs", t.trackId === track.trackId ? "border-primary bg-primary-soft font-medium text-primary-ink" : "border-line text-muted hover:bg-sunken")}>
            {t.status === "not_started" ? "" : "✓ "}
            {i + 1}. {t.title}
          </Link>
        ))}
      </nav>

      {!!track.reviewNote && (
        <p role="status" className="mb-4 rounded-control border border-danger/25 bg-danger/5 px-4 py-2.5 text-sm text-danger-ink">
          <strong>A reviewer rejected something:</strong> {track.reviewNote}
        </p>
      )}
      {reviewable && track.missingRequired!.length > 0 && (
        <p className="mb-4 rounded-control border border-line bg-panel px-4 py-2.5 text-sm text-muted">Needed before it can be reviewed: {track.missingRequired!.map((f) => REQUIRED_LABEL[f] ?? f).join(", ")}.</p>
      )}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Section n={1} title="Track information" hint="Managed with the release. Change it there.">
          <KV
            items={[
              ["Title", track.title],
              ["Primary artist", track.artist.name],
              ["Featured artists", track.featuredArtists.join(", ") || "–"],
              ["Release", track.release.title],
              ["Duration", fmtDuration(track.durationMs)],
              ["Release year", track.release.releaseDate ? track.release.releaseDate.slice(0, 4) : "–"],
              ["Release date", fmtDate(track.release.releaseDate)],
              ["ISRC", track.isrc ?? "Not recorded"],
            ]}
          />
        </Section>

        <Section n={2} title="Language" hint="Only the languages sung in this song. Do not judge by the artist or where they are from.">
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={draft.languageUnknown} onChange={(e) => setDraft(setUnknownLanguage(draft, e.target.checked))} />
            Unknown or cannot be classified
            {draft.languageUnknown && track.languageUnknown && track.languageUnknownReview && <ProvenanceBadge p={track.languageUnknownReview} />}
          </label>
          <MultiSelect
            label="Languages"
            disabled={draft.languageUnknown}
            options={offered(tax.languages, draft.languages.map((l) => l.id)).map((l) => ({ id: l.id, label: termLabel(tax.languages, l.id), group: groupLabel(l.groupId) }))}
            value={draft.languages.map((l) => l.id)}
            onChange={(ids) => setDraft(withLanguages(draft, ids))}
            emptyText={draft.languageUnknown ? "Marked as unknown" : "No language yet"}
            extra={(lid) => {
              const row = draft.languages.find((l) => l.id === lid)!;
              const was = track.languages.find((l) => l.id === lid);
              return (
                <>
                  <Select aria-label={`Role of ${termLabel(tax.languages, lid)}`} value={row.role} onChange={(e) => setDraft(setLanguageRole(draft, lid, e.target.value as LanguageRole))}>
                    <option value="primary">Primary</option>
                    <option value="secondary">Secondary</option>
                  </Select>
                  <ProvenanceBadge p={was && was.role === row.role ? was : undefined} />
                </>
              );
            }}
          />
        </Section>

        <Section n={3} title="Cultural affiliation" hint="Separate from language. Do not copy it from the artist. Leave it empty if you are not sure.">
          {picker("Cultures", tax.cultures, draft.cultures, track.cultures, (cultures) => setDraft({ ...draft, cultures }))}
        </Section>

        <Section n={4} title="Regional association" hint="An editorial choice about the song, not simply where the artist lives.">
          {picker("Regions", tax.regions, draft.regions, track.regions, (regions) => setDraft({ ...draft, regions }))}
        </Section>

        <Section n={5} title="Genre and style" hint="The primary genre is the one the app shows and filters by.">
          <MultiSelect
            label="Genres"
            options={offered(tax.genres, draft.genres.map((g) => g.id)).map((g) => ({ id: g.id, label: termLabel(tax.genres, g.id), group: g.parentId ? termLabel(tax.genres, g.parentId) : undefined }))}
            value={draft.genres.map((g) => g.id)}
            onChange={(ids) => setDraft(withGenres(draft, ids))}
            emptyText="No genre yet"
            extra={(gid) => {
              const row = draft.genres.find((g) => g.id === gid)!;
              const was = track.genres.find((g) => g.id === gid);
              return (
                <>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="radio" name="primary-genre" className="accent-primary" checked={row.primary} onChange={() => setDraft(setPrimaryGenre(draft, gid))} />
                    Primary
                  </label>
                  <ProvenanceBadge p={was && was.primary === row.primary ? was : undefined} />
                </>
              );
            }}
          />
        </Section>

        <Section n={6} title="Mood and character" hint="All optional.">
          <div className="space-y-4">
            {ATTRIBUTES.map((a) => {
              const chosen = draft.attributes[a.key];
              const set = (ids: string[]) => setDraft({ ...draft, attributes: { ...draft.attributes, [a.key]: ids } });
              return (
                <div key={a.key}>
                  <h3 className="mb-1.5 text-sm font-semibold">{a.label}</h3>
                  {a.single ? (
                    <Select aria-label={a.label} value={chosen[0] ?? ""} onChange={(e) => set(e.target.value ? [e.target.value] : [])}>
                      <option value="">Not set</option>
                      {offered(tax.attributes[a.key], chosen).map((t) => (
                        <option key={t.id} value={t.id}>
                          {termLabel(tax.attributes[a.key], t.id)}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    picker(a.label, tax.attributes[a.key], chosen, track.attributes[a.key], set)
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <Section n={7} title="Sources and verification" hint={`${track.updatedAt ? `Last changed ${fmtDateTime(track.updatedAt)}${track.updatedBy ? ` by ${track.updatedBy.email}` : ""}. ` : ""}${track.submittedAt ? `Submitted ${fmtDateTime(track.submittedAt)}. ` : ""}Showing what is saved.`} className="lg:col-span-2">
          <MetadataReview track={track} tax={tax} unsaved={dirty} onDone={onSaved} />
        </Section>
      </div>

      <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-end gap-2 rounded-card border border-line bg-panel/95 px-4 py-3">
        <span className="mr-auto text-sm text-muted" role="status">
          {dirty ? "You have unsaved changes." : "No unsaved changes."}
        </span>
        {error && (
          <div className="order-first flex w-full items-center gap-2">
            <div className="flex-1">
              <ErrorBox error={error.message} />
            </div>
            {error.code === "stale_version" && (
              <Button small onClick={onReload}>
                Reload track
              </Button>
            )}
          </div>
        )}
        <Button disabled={!dirty || busy} onClick={() => setDraft(original)}>
          Discard
        </Button>
        <Button disabled={!dirty || busy} onClick={() => void save(false)}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {next && (
          <Button variant="primary" disabled={busy} onClick={() => void save(true)}>
            {dirty ? "Save and next track" : "Next track"}
          </Button>
        )}
      </div>
    </>
  );
}
