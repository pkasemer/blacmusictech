"use client";

import { useId, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { singleError, visibilityWarning } from "@/lib/combine";
import { usableGenre } from "@/lib/taxonomy";
import type { GenreList, ReleaseDetail, TrackRow } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { ImagePicker } from "./CoverUpload";
import { Modal } from "./Dialogs";
import { Button, ErrorBox, Field, Input, Select } from "./ui";

/** Moves one song out of an album or EP into its own single. */
export function MakeSingleDialog({ track, from, onClose, onDone }: { track: TrackRow | null; from: ReleaseDetail; onClose: () => void; onDone: (releaseId: string) => void }) {
  return (
    <Modal open={!!track} title={`Make "${track?.title ?? ""}" a single`} onClose={onClose}>
      {track && <SingleForm track={track} from={from} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function SingleForm({ track, from, onClose, onDone }: { track: TrackRow; from: ReleaseDetail; onClose: () => void; onDone: (releaseId: string) => void }) {
  const [title, setTitle] = useState(track.title);
  const [genre, setGenre] = useState(track.genre || from.genre || "");
  const [date, setDate] = useState("");
  const [cover, setCover] = useState<"album" | "upload" | "none">(from.coverUrl ? "album" : "upload");
  const [uploaded, setUploaded] = useState<{ id: string; url?: string } | null>(null);
  const [visibility, setVisibility] = useState<"draft" | "public">(from.visibility === "public" ? "public" : "draft");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const genres = useApi<GenreList>("/api/genres");
  const names = (genres.data?.genres ?? []).map((g) => g.name);
  // a switched-off genre is not sent: the server then keeps the song's own
  const chosen = usableGenre(genre, genres.data?.genres);
  const options = chosen && !names.includes(chosen) ? [chosen, ...names] : names;
  const ids = [useId(), useId(), useId()];
  const last = from.tracks.length === 1;
  const warning = visibilityWarning([{ visibility: from.visibility }], visibility);
  const ready = title.trim().length > 0 && (cover !== "upload" || !!uploaded) && agreed;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError("");
        try {
          const made = await api<ReleaseDetail>(`/tracks/${track.id}/single`, {
            method: "POST",
            body: {
              title: title.trim(),
              ...(chosen ? { genre: chosen } : {}),
              ...(date ? { releaseDate: date } : {}),
              ...(cover === "album" ? { useAlbumCover: true } : cover === "upload" ? { coverImageId: uploaded!.id } : {}),
              visibility,
            },
          });
          onDone(made.id);
        } catch (err) {
          setError(err instanceof ApiError ? singleError(err.code, err.status, err.message) : "Could not make the single.");
          setBusy(false);
        }
      }}
    >
      <Field label="Title" htmlFor={ids[0]!}>
        <Input id={ids[0]} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Genre" htmlFor={ids[1]!}>
          <Select id={ids[1]} className="w-full" value={chosen} onChange={(e) => setGenre(e.target.value)}>
            <option value="">Automatic</option>
            {options.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Release date (optional)" htmlFor={ids[2]!}>
          <Input id={ids[2]} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <fieldset className="space-y-1.5 text-sm">
        <legend className="mb-1 text-xs font-medium">Cover art</legend>
        {(["album", "upload", "none"] as const)
          .filter((c) => c !== "album" || !!from.coverUrl)
          .map((c) => (
            <label key={c} className="flex items-center gap-2">
              <input type="radio" name="single-cover" className="accent-primary" checked={cover === c} onChange={() => setCover(c)} />
              {c === "album" ? "Use the cover of this release" : c === "upload" ? "Upload a new one" : "No cover"}
            </label>
          ))}
        {cover === "upload" && <ImagePicker purpose="cover" label="cover" value={uploaded} onChange={setUploaded} />}
      </fieldset>
      <fieldset className="space-y-1.5 text-sm">
        <legend className="mb-1 text-xs font-medium">When it is ready</legend>
        {(["public", "draft"] as const).map((v) => (
          <label key={v} className="flex items-center gap-2">
            <input type="radio" name="single-visibility" className="accent-primary" checked={visibility === v} onChange={() => setVisibility(v)} />
            {v === "public" ? "Publish now" : "Save as a draft"}
          </label>
        ))}
        {warning && <p className="rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-warning-ink">{warning}</p>}
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          The song will move out of &ldquo;{from.title}&rdquo; into its own single. Its plays and playlist places are kept.
          {last ? " It is the only song, so that release will be removed." : ""}
        </span>
      </label>
      {error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!ready || busy}>
          {busy ? "Working…" : "Make single"}
        </Button>
      </div>
    </form>
  );
}
