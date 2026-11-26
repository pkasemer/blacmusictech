"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { VerificationBadge } from "@/components/badges";
import { ImagePicker } from "@/components/CoverUpload";
import { ICheck, IMic, IPlus } from "@/components/icons";
import { NewArtistForm } from "@/components/NewArtistForm";
import { usePageTitle } from "@/components/page-meta";
import { useToast } from "@/components/Shell";
import { Avatar, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, SearchField, Select, Textarea } from "@/components/ui";
import { api, ApiError, qs } from "@/lib/api";
import type { ArtistDetail, ArtistList, GenreList, ReleaseDetail } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

interface Picked {
  id: string;
  name: string;
  imageUrl?: string;
}

function ArtistStep({ picked, onPick }: { picked: Picked | null; onPick: (a: Picked | null) => void }) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const term = useDebounced(q.trim());
  const res = useApi<ArtistList>(picked ? null : `/artists${qs({ q: term, limit: 8 })}`);

  if (picked) {
    return (
      <div className="flex items-center gap-3">
        <Avatar name={picked.name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{picked.name}</div>
          <div className="text-xs text-muted">Releases will be added to this artist.</div>
        </div>
        <Button onClick={() => onPick(null)}>Change artist</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SearchField aria-label="Search artists" placeholder="Search artists by name…" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
      {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <Loading rows={3} />}
      {res.data && res.data.artists.length === 0 && <p className="py-2 text-sm text-muted">{term ? `No artist matches “${term}”.` : "No artists yet."}</p>}
      {res.data && res.data.artists.length > 0 && (
        <ul className="divide-y divide-line rounded-control border border-line">
          {res.data.artists.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => onPick({ id: a.id, name: a.name, imageUrl: a.imageUrl })} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-sunken/60">
                <Avatar name={a.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.name}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {a.ownerEmail ?? "Catalog artist (no account)"} · {a.releaseCount} release{a.releaseCount === 1 ? "" : "s"}
                  </span>
                </span>
                <VerificationBadge v={a.verification} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!creating ? (
        <Button onClick={() => setCreating(true)}>
          <IPlus size={14} /> Create a new artist{term ? ` “${term}”` : ""}
        </Button>
      ) : (
        <div className="rounded-control border border-line bg-sunken/40 p-4">
          <h3 className="mb-3 text-sm font-semibold">New artist</h3>
          <NewArtistForm
            initialName={term}
            onCancel={() => setCreating(false)}
            onUseExisting={(a) => onPick({ id: a.id, name: a.name, imageUrl: a.imageUrl })}
            onCreated={(a: ArtistDetail) => onPick({ id: a.id, name: a.name, imageUrl: a.imageUrl })}
          />
        </div>
      )}
    </div>
  );
}

export default function NewReleasePage() {
  usePageTitle("New release", "release", false);
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const fromParam = params.get("artistId");
  const preset = useApi<ArtistDetail>(fromParam ? `/artists/${fromParam}` : null);
  const [chosen, setChosen] = useState<Picked | null | undefined>(undefined);
  const picked: Picked | null = chosen !== undefined ? chosen : preset.data ? { id: preset.data.id, name: preset.data.name, imageUrl: preset.data.imageUrl } : null;

  const genres = useApi<GenreList>("/api/genres");
  const [type, setType] = useState<"single" | "album">("single");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<{ id: string; url?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idT = useId();
  const idG = useId();
  const idD = useId();
  const idN = useId();

  async function create() {
    if (!picked) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<ReleaseDetail>(`/artists/${picked.id}/releases`, {
        method: "POST",
        body: { type, title: title.trim(), genre, description: description.trim(), ...(date ? { releaseDate: date } : {}), ...(cover ? { coverImageId: cover.id } : {}) },
      });
      toast("Draft release created. Now add the tracks.");
      router.push(`/releases/${r.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the release.");
      setBusy(false);
    }
  }

  const ready = !!picked && title.trim().length >= 1;

  return (
    <>
      <PageHeader title="New release" subtitle="Add a single or an album for an artist. It starts as a draft: you add the tracks next, then publish when it is ready." />
      <div className="mx-auto max-w-2xl space-y-4">
        <Card title="1. Artist">
          {fromParam && preset.loading && !preset.data && chosen === undefined ? <Loading rows={1} /> : <ArtistStep picked={picked} onPick={setChosen} />}
          {fromParam && preset.error && <ErrorBox error={preset.error} />}
        </Card>

        <Card title="2. Release details">
          {!picked ? (
            <Empty icon={<IMic size={20} />}>Choose or create the artist first.</Empty>
          ) : (
            <div className="space-y-4">
              <fieldset>
                <legend className="mb-1 text-xs font-medium">Type</legend>
                <div className="inline-flex rounded-control border border-line p-0.5" role="radiogroup" aria-label="Release type">
                  {(["single", "album"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={type === t}
                      onClick={() => setType(t)}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm ${type === t ? "bg-primary-soft font-medium text-primary-ink" : "text-muted hover:text-ink"}`}
                    >
                      {type === t && <ICheck size={13} />}
                      {t === "single" ? "Single" : "Album or EP"}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted">{type === "single" ? "A single has exactly one track." : "An album can have many tracks."}</p>
              </fieldset>

              <Field label="Title" htmlFor={idT}>
                <Input id={idT} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Genre" htmlFor={idG}>
                  <Select id={idG} className="w-full" value={genre} onChange={(e) => setGenre(e.target.value)}>
                    <option value="">Choose a genre…</option>
                    {(genres.data?.genres ?? []).map((g) => (
                      <option key={g.id} value={g.name}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Release date (optional)" htmlFor={idN} hint="Shown as the release date; publishing is separate">
                  <Input id={idN} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              </div>
              <Field label="Description (optional)" htmlFor={idD}>
                <Textarea id={idD} rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <div>
                <div className="mb-1 text-xs font-medium">Cover art</div>
                <ImagePicker purpose="cover" label="cover" value={cover} onChange={setCover} />
              </div>
              {error && <ErrorBox error={error} />}
              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                <Button onClick={() => router.back()}>Cancel</Button>
                <Button variant="primary" disabled={!ready || busy} onClick={create}>
                  {busy ? "Creating…" : "Create draft and add tracks"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
