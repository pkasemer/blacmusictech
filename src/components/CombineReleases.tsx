"use client";

import { useEffect, useId, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { albumKind, combinable, combineError, defaultVisibility, keepOrder, move, visibilityWarning } from "@/lib/combine";
import { usableGenre } from "@/lib/taxonomy";
import type { GenreList, ReleaseDetail, ReleaseRow } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { VisibilityBadge } from "./badges";
import { ImagePicker } from "./CoverUpload";
import { Modal } from "./Dialogs";
import { IArrowDown, IArrowUp, IImage } from "./icons";
import { Button, ErrorBox, Field, IconButton, Input, Loading, Select, cx } from "./ui";

export function CombineDialog({ open, artistName, releases, onClose, onDone }: { open: boolean; artistName: string; releases: ReleaseRow[]; onClose: () => void; onDone: (releaseId: string) => void }) {
  return (
    <Modal open={open} title={`Make an album or EP for ${artistName}`} onClose={onClose} wide>
      {open && <CombineForm releases={releases} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

/** The full releases (for their songs), fetched as they are ticked and kept. */
function useReleaseDetails(ids: string[]) {
  const [map, setMap] = useState<ReadonlyMap<string, ReleaseDetail>>(() => new Map());
  const [error, setError] = useState("");
  const missing = ids.filter((id) => !map.has(id)).join(",");
  useEffect(() => {
    if (!missing) return;
    const ctrl = new AbortController();
    Promise.all(missing.split(",").map((id) => api<ReleaseDetail>(`/releases/${id}`, { signal: ctrl.signal }))).then(
      (found) => {
        if (ctrl.signal.aborted) return;
        setError("");
        setMap((old) => new Map([...old, ...found.map((r) => [r.id, r] as const)]));
      },
      (e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof ApiError ? e.message : "Could not read the songs.");
      },
    );
    return () => ctrl.abort();
  }, [missing]);
  return { map, error, loading: !!missing && !error };
}

function CombineForm({ releases, onClose, onDone }: { releases: ReleaseRow[]; onClose: () => void; onDone: (releaseId: string) => void }) {
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [cover, setCover] = useState<string>(""); // a release id, "upload" or "none"
  const [uploaded, setUploaded] = useState<{ id: string; url?: string } | null>(null);
  const [visibility, setVisibility] = useState<"draft" | "public" | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const details = useReleaseDetails(pickedIds);
  const genres = useApi<GenreList>("/api/genres");
  const idT = useId();
  const idG = useId();
  const idD = useId();

  const picked = pickedIds.map((id) => releases.find((r) => r.id === id)).filter((r): r is ReleaseRow => !!r);
  const songs = pickedIds.flatMap((id) => (details.map.get(id)?.tracks ?? []).map((t) => ({ ...t, from: details.map.get(id)!.title })));
  const songOrder = keepOrder(order, songs.map((s) => s.id));
  const allLoaded = pickedIds.every((id) => details.map.has(id));
  const covers = picked.filter((r) => r.coverUrl);
  // until a choice is made (or the chosen release is unticked): the first picked cover, else none
  const coverChoice = cover === "upload" || cover === "none" || covers.some((r) => r.id === cover) ? cover : (covers[0]?.id ?? "none");
  const genreValue = usableGenre(genre ?? details.map.get(pickedIds[0] ?? "")?.genre ?? "", genres.data?.genres);
  const vis = visibility ?? defaultVisibility(picked);
  const warning = visibilityWarning(picked, vis);
  const kind = albumKind(songs.length);
  const ready = picked.length >= 2 && picked.length <= 50 && allLoaded && title.trim().length > 0 && (coverChoice !== "upload" || !!uploaded) && agreed;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const made = await api<ReleaseDetail>("/releases/combine", {
        method: "POST",
        body: {
          releaseIds: pickedIds,
          title: title.trim(),
          ...(genreValue ? { genre: genreValue } : {}),
          ...(date ? { releaseDate: date } : {}),
          ...(coverChoice === "upload" ? { coverImageId: uploaded!.id } : coverChoice !== "none" ? { coverFromReleaseId: coverChoice } : {}),
          trackIds: songOrder,
          visibility: vis,
        },
      });
      onDone(made.id);
    } catch (e) {
      setError(e instanceof ApiError ? combineError(e.code, e.status, e.message) : "Could not combine the releases.");
      setBusy(false);
    }
  }

  const tile = (value: string, label: string, content: React.ReactNode) => (
    <button
      key={value}
      type="button"
      aria-pressed={coverChoice === value}
      onClick={() => setCover(value)}
      className={cx("w-24 rounded-control border p-1 text-center", coverChoice === value ? "border-primary bg-primary-soft" : "border-line hover:bg-sunken")}
    >
      <span className="flex aspect-square items-center justify-center overflow-hidden rounded bg-sunken text-faint">{content}</span>
      <span className="mt-1 block truncate text-[11px]">{label}</span>
    </button>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) void submit();
      }}
    >
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">1. Choose 2 to 50 releases</legend>
        <ul className="relative max-h-48 divide-y divide-line overflow-y-auto rounded-control border border-line text-sm">
          {releases.map((r) => (
            <li key={r.id}>
              <label className={cx("flex items-center gap-3 px-3 py-2", !combinable(r) && "opacity-50")}>
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  disabled={!combinable(r)}
                  checked={pickedIds.includes(r.id)}
                  onChange={(e) => setPickedIds((old) => (e.target.checked ? [...old, r.id] : old.filter((x) => x !== r.id)))}
                />
                <span className="min-w-0 flex-1 truncate">
                  {r.title}
                  <span className="ml-2 text-xs text-muted">
                    {r.trackCount} song{r.trackCount === 1 ? "" : "s"}
                  </span>
                </span>
                <VisibilityBadge v={r.visibility} takenDown={r.takenDown} />
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {picked.length >= 2 && (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem_10rem]">
            <Field label="2. Title" htmlFor={idT}>
              <Input id={idT} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Genre" htmlFor={idG}>
              <Select id={idG} className="w-full" value={genreValue} onChange={(e) => setGenre(e.target.value)}>
                <option value="">Automatic (if all songs share one)</option>
                {(genres.data?.genres ?? []).map((g) => (
                  <option key={g.id} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Release date (optional)" htmlFor={idD}>
              <Input id={idD} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">3. Cover art</legend>
            <div className="flex flex-wrap gap-2">
              {covers.map((r) =>
                // eslint-disable-next-line @next/next/no-img-element -- the image comes from the API's own media host
                tile(r.id, r.title, <img src={r.coverUrl} alt={`Cover of ${r.title}`} className="h-full w-full object-cover" />),
              )}
              {tile("upload", "Upload new", <IImage size={22} />)}
              {tile("none", "No cover", <span className="text-xs">None</span>)}
            </div>
            {coverChoice === "upload" && (
              <div className="mt-3">
                <ImagePicker purpose="cover" label="cover" value={uploaded} onChange={setUploaded} />
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">4. Song order</legend>
            {details.error && <ErrorBox error={details.error} />}
            {details.loading && <Loading rows={2} />}
            <ol className="relative max-h-56 divide-y divide-line overflow-y-auto rounded-control border border-line text-sm">
              {songOrder.map((id, i) => {
                const s = songs.find((x) => x.id === id)!;
                return (
                  <li key={id} className="flex items-center gap-3 px-3 py-1.5">
                    <span className="w-6 text-right text-xs tabular-nums text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {s.title}
                      <span className="ml-2 text-xs text-muted">from {s.from}</span>
                    </span>
                    <IconButton small label={`Move ${s.title} up`} disabled={i === 0} onClick={() => setOrder(move(songOrder, i, -1))}>
                      <IArrowUp size={14} />
                    </IconButton>
                    <IconButton small label={`Move ${s.title} down`} disabled={i === songOrder.length - 1} onClick={() => setOrder(move(songOrder, i, 1))}>
                      <IArrowDown size={14} />
                    </IconButton>
                  </li>
                );
              })}
            </ol>
          </fieldset>

          <fieldset className="space-y-1.5 text-sm">
            <legend className="mb-1.5 text-sm font-semibold">5. When it is ready</legend>
            {(["public", "draft"] as const).map((v) => (
              <label key={v} className="flex items-center gap-2">
                <input type="radio" name="combine-visibility" className="accent-primary" checked={vis === v} onChange={() => setVisibility(v)} />
                {v === "public" ? "Publish now" : "Save as a draft"}
              </label>
            ))}
            {warning && <p className="rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-warning-ink">{warning}</p>}
          </fieldset>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              The {picked.length} original releases will be removed and their songs moved into the new {kind}. Plays and playlists are kept. This cannot be undone.
            </span>
          </label>
        </>
      )}
      {error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!ready || busy}>
          {busy ? "Working…" : picked.length >= 2 && allLoaded ? `Make ${kind} (${songs.length} songs)` : "Make album or EP"}
        </Button>
      </div>
    </form>
  );
}
