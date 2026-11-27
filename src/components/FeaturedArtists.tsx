"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ApiError, qs } from "@/lib/api";
import { canLink, featuredArtistError, featureNote, pickBlock, type Feature, type FeaturedView } from "@/lib/featuredArtists";
import type { ArtistList } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Dialogs";
import { IClose } from "./icons";
import { useToast } from "./Shell";
import { Avatar, Button, Card, ErrorBox, Loading, SearchField } from "./ui";

/** Where a feature goes: the whole release, or one song. */
interface Place {
  path: string;
  label: string;
  features: Feature[];
}

const explain = (e: unknown) => (e instanceof ApiError ? featuredArtistError(e.code, e.message) : "Could not save.");

export function FeaturedArtistsCard({ releaseId, mainArtistId, onChanged }: { releaseId: string; mainArtistId: string; onChanged: () => void }) {
  const toast = useToast();
  const q = useApi<FeaturedView>(`/releases/${releaseId}/featured-artists`);
  const [saved, setSaved] = useState<FeaturedView | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ feature: Feature; where: string } | null>(null);
  const [linking, setLinking] = useState(false);
  const view = saved ?? q.data;

  const reload = () => {
    setSaved(null);
    q.reload();
  };
  const took = (v: FeaturedView, message: string) => {
    setSaved(v);
    toast(message);
    onChanged();
  };

  const places: Place[] = view
    ? [
        { path: `/releases/${releaseId}/featured-artists`, label: "Every song", features: view.release },
        ...view.tracks.map((t) => ({ path: `/tracks/${t.trackId}/featured-artists`, label: t.title, features: t.artists })),
      ]
    : [];
  const target = places.find((p) => p.path === adding);

  async function link(place: Place, artistId: string, name: string) {
    setLinking(true);
    try {
      took(await api<FeaturedView>(place.path, { method: "POST", body: { artistId } }), `${name} now links to their profile`);
    } catch (e) {
      toast(explain(e), "error");
      reload();
    } finally {
      setLinking(false);
    }
  }

  return (
    <Card title="Featured artists">
      {q.error && !saved ? (
        q.error.code === "not_available" ? (
          <p className="text-sm text-muted">{featuredArtistError("not_available", "")}</p>
        ) : (
          <ErrorBox error={q.error} onRetry={q.reload} />
        )
      ) : !view ? (
        <Loading />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">Guests show after the main artist in the app, and listeners can open their profiles.</p>
          <ul className="divide-y divide-line">
            {places.map((place, i) => (
              <li key={place.path} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className={i === 0 ? "w-full truncate text-sm font-semibold sm:w-48" : "w-full truncate text-sm sm:w-48"} title={place.label}>
                  {place.label}
                </span>
                <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {place.features.length === 0 && <li className="text-sm text-faint">No guests</li>}
                  {place.features.map((f) => (
                    <li key={f.creditId} className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-control border border-line bg-panel py-1 pl-1.5 pr-1 text-sm">
                      {f.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.imageUrl} alt="" className="size-5 rounded-full object-cover" />
                      ) : (
                        <Avatar name={f.name} size={20} />
                      )}
                      {f.artistId ? (
                        <Link href={`/artists/${f.artistId}`} className="truncate font-medium hover:underline">
                          {f.name}
                        </Link>
                      ) : (
                        <span className="truncate font-medium">{f.name}</span>
                      )}
                      {f.verified && <span className="text-xs text-success-ink">Verified</span>}
                      {featureNote(f) && <span className="text-xs text-muted">{featureNote(f)}</span>}
                      {canLink(f) && (
                        <Button small disabled={linking} aria-label={`Link the profile of ${f.name} on ${place.label}`} onClick={() => void link(place, f.artistId, f.name)}>
                          Link profile
                        </Button>
                      )}
                      <button type="button" aria-label={`Remove ${f.name} from ${i === 0 ? "every song" : place.label}`} onClick={() => setRemoving({ feature: f, where: i === 0 ? "every song on this release" : `"${place.label}"` })} className="rounded p-1 text-muted hover:bg-sunken hover:text-ink">
                        <IClose size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
                <Button small aria-label={`Add a featured artist to ${i === 0 ? "every song" : place.label}`} onClick={() => setAdding(place.path)}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal open={!!target} title={target ? `Add a featured artist to ${target.path === places[0]?.path ? "every song" : `"${target.label}"`}` : ""} onClose={() => setAdding(null)}>
        {target && (
          <Picker
            place={target}
            mainArtistId={mainArtistId}
            onDone={(v, name) => {
              setAdding(null);
              took(v, `${name} added`);
            }}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={!!removing}
        title={`Remove ${removing?.feature.name ?? ""}?`}
        description={`They will no longer be listed as a featured artist on ${removing?.where ?? ""}. Other credits stay as they are.`}
        confirmLabel="Remove"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          try {
            took(await api<FeaturedView>(`/featured-artists/${removing!.feature.creditId}`, { method: "DELETE" }), "Featured artist removed");
          } catch (e) {
            // the owner saving their credits gives them new ids
            if (!(e instanceof ApiError) || e.status !== 404 || e.code === "not_available") throw e;
            toast(featuredArtistError("not_found", ""), "error");
            reload();
          }
        }}
      />
    </Card>
  );
}

function Picker({ place, mainArtistId, onDone }: { place: Place; mainArtistId: string; onDone: (v: FeaturedView, name: string) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const term = useDebounced(q.trim());
  const found = useApi<ArtistList>(term.length >= 2 ? `/artists${qs({ q: term, limit: 8 })}` : null);

  return (
    <div className="space-y-3">
      <SearchField aria-label="Search artists" placeholder="Search artists by name…" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
      {error && <ErrorBox error={error} />}
      {found.error ? (
        <ErrorBox error={found.error} onRetry={found.reload} />
      ) : term.length < 2 ? (
        <p className="text-sm text-muted">Type at least two letters.</p>
      ) : !found.data ? (
        <Loading />
      ) : found.data.artists.length === 0 ? (
        <p className="text-sm text-muted">No artist matches. A guest needs an artist profile on Blac first.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto">
          {found.data.artists.map((a) => {
            const block = pickBlock(a, mainArtistId, place.features);
            return (
              <li key={a.id} className="flex items-center gap-2 py-2">
                <Avatar name={a.name} size={24} />
                <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                {block && <span className="text-xs text-muted">{block}</span>}
                <Button
                  small
                  disabled={busy || !!block}
                  aria-label={`Add ${a.name}`}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      onDone(await api<FeaturedView>(place.path, { method: "POST", body: { artistId: a.id } }), a.name);
                    } catch (e) {
                      setError(explain(e));
                      setBusy(false);
                    }
                  }}
                >
                  Add
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
