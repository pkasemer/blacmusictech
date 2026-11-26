"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { api, ApiError, qs } from "@/lib/api";
import type { ArtistDetail, ArtistList, ArtistRow } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";
import { ImagePicker } from "./CoverUpload";
import { IAlert } from "./icons";
import { VerificationBadge } from "./badges";
import { Button, ErrorBox, Field, Input, Textarea } from "./ui";

/**
 * Creates an artist that has no account yet (a catalog artist). It first looks for artists with the same name,
 * because creating a second "Burna Boy" by accident is the usual mistake.
 */
export function NewArtistForm({
  initialName = "",
  onCreated,
  onUseExisting,
  onCancel,
}: {
  initialName?: string;
  onCreated: (a: ArtistDetail) => void;
  onUseExisting?: (a: ArtistRow) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState("");
  const [image, setImage] = useState<{ id: string; url?: string } | null>(null);
  const [anyway, setAnyway] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const a = useId();
  const b = useId();
  const c = useId();

  const term = useDebounced(name.trim());
  const similar = useApi<ArtistList>(term.length >= 2 ? `/artists${qs({ q: term, limit: 5 })}` : null);
  const exact = (similar.data?.artists ?? []).filter((x) => x.name.trim().toLowerCase() === term.toLowerCase());
  const needsConfirm = exact.length > 0;
  const ready = name.trim().length >= 1 && (!needsConfirm || anyway);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError("");
        try {
          const created = await api<ArtistDetail>("/artists", { method: "POST", body: { name: name.trim(), bio: bio.trim(), ...(image ? { imageId: image.id } : {}) } });
          onCreated(created);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not create the artist.");
          setBusy(false);
        }
      }}
    >
      <Field label="Artist name" htmlFor={a} hint="As it should appear in the app (1–100 characters)">
        <Input id={a} value={name} maxLength={100} autoFocus onChange={(e) => (setName(e.target.value), setAnyway(false))} />
      </Field>

      {needsConfirm && (
        <div role="alert" className="rounded-control border border-warning/40 bg-warning/10 p-3 text-sm text-warning-ink">
          <div className="mb-1.5 flex items-center gap-2 font-medium">
            <IAlert size={15} /> An artist with this name already exists
          </div>
          <ul className="space-y-1.5">
            {exact.map((x) => (
              <li key={x.id} className="flex items-center gap-2">
                <Link href={`/artists/${x.id}`} className="font-medium underline" target="_blank">
                  {x.name}
                </Link>
                <VerificationBadge v={x.verification} />
                <span className="text-xs">{x.ownerEmail ?? "catalog artist"} · {x.releaseCount} release{x.releaseCount === 1 ? "" : "s"}</span>
                {onUseExisting && (
                  <Button small className="ml-auto" onClick={() => onUseExisting(x)}>
                    Use this artist
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" className="accent-primary" checked={anyway} onChange={(e) => setAnyway(e.target.checked)} /> This is a different artist: create a new one anyway
          </label>
        </div>
      )}

      <Field label="Bio (optional)" htmlFor={b}>
        <Textarea id={b} rows={3} maxLength={1000} value={bio} onChange={(e) => setBio(e.target.value)} />
      </Field>
      <div>
        <div id={c} className="mb-1 text-xs font-medium">
          Picture
        </div>
        <ImagePicker purpose="avatar" label="picture" round value={image} onChange={setImage} />
      </div>
      {error && <ErrorBox error={error} />}
      <p className="text-[11px] text-muted">The artist is added without an account, so only administrators manage them. They are not verified until you verify them.</p>
      <div className="flex justify-end gap-2">
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary" disabled={!ready || busy}>
          {busy ? "Creating…" : "Create artist"}
        </Button>
      </div>
    </form>
  );
}
