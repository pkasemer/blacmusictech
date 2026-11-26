"use client";

import { useId, useRef, useState } from "react";
import { api, ApiError, apiUpload } from "@/lib/api";
import type { UploadedImage } from "@/lib/types";
import { IImage } from "./icons";
import { useToast } from "./Shell";
import { Button } from "./ui";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 10 * 1024 * 1024;

function check(file: File): string | null {
  if (!TYPES.includes(file.type)) return "Use a JPEG, PNG or WebP image.";
  if (file.size > MAX) return "The image must be 10 MB or smaller.";
  return null;
}

/** Uploads through this site's server, which asks the Backend to validate and resize the picture. */
async function uploadImage(file: File, purpose: "cover" | "avatar"): Promise<UploadedImage> {
  const img = await apiUpload<UploadedImage>(`/api/images?purpose=${purpose}`, file);
  if (img.status !== "ready") throw new ApiError(0, "not_ready", "The image was not accepted.");
  return img;
}

function Frame({ src, alt, round, onBroken }: { src?: string; alt: string; round?: boolean; onBroken: () => void }) {
  return (
    <div className={`flex size-32 shrink-0 items-center justify-center overflow-hidden border border-line bg-sunken text-center text-xs text-muted ${round ? "rounded-full" : "rounded-card"}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- the image comes from the API's own media host
        <img src={src} alt={alt} className="h-full w-full object-cover" onError={onBroken} />
      ) : (
        <span className="flex flex-col items-center gap-1 px-2">
          <IImage size={20} className="text-faint" />
          None yet
        </span>
      )}
    </div>
  );
}

/**
 * Shows a picture and lets an administrator upload or remove it. `target` is the Backend path to PATCH
 * (a playlist, a release or an artist) and `field` the name of the picture field in that body.
 */
export function CoverUpload({
  target,
  field = "coverImageId",
  purpose = "cover",
  coverUrl,
  label = "Cover",
  round,
  hint,
  onChanged,
}: {
  target: string;
  field?: "coverImageId" | "imageId";
  purpose?: "cover" | "avatar";
  coverUrl?: string;
  label?: string;
  round?: boolean;
  hint?: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>();
  const [broken, setBroken] = useState(false);
  const id = useId();

  async function pick(file: File | undefined) {
    if (!file) return;
    const bad = check(file);
    if (bad) return toast(bad, "error");
    const local = URL.createObjectURL(file);
    setPreview(local);
    setBusy(true);
    try {
      const img = await uploadImage(file, purpose);
      await api(target, { method: "PATCH", body: { [field]: img.id } });
      toast(`${label} updated`);
      setBroken(false);
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : `Could not upload the ${label.toLowerCase()}.`, "error");
    } finally {
      setBusy(false);
      setPreview(undefined);
      URL.revokeObjectURL(local);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(target, { method: "PATCH", body: { [field]: "" } });
      toast(`${label} removed`);
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : `Could not remove the ${label.toLowerCase()}.`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex flex-wrap items-start gap-4">
      <Frame src={preview ?? (broken ? undefined : coverUrl)} alt={label} round={round} onBroken={() => setBroken(true)} />
      <div className="min-w-0 flex-1 basis-40 space-y-2 text-sm">
        <p className="text-muted">{hint ?? "A square picture works best (JPEG, PNG or WebP, up to 10 MB). It is checked and resized on upload."}</p>
        <input id={id} ref={input} type="file" accept={TYPES.join(",")} className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Uploading…" : coverUrl ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          </Button>
          {coverUrl && (
            <Button disabled={busy} onClick={remove}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Picks and uploads a picture before the thing it belongs to exists (the new artist and new release forms). */
export function ImagePicker({
  purpose,
  value,
  label,
  round,
  onChange,
}: {
  purpose: "cover" | "avatar";
  value: { id: string; url?: string } | null;
  label: string;
  round?: boolean;
  onChange: (v: { id: string; url?: string } | null) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    const bad = check(file);
    if (bad) return toast(bad, "error");
    setBusy(true);
    try {
      const img = await uploadImage(file, purpose);
      setBroken(false);
      onChange({ id: img.id, url: img.urls?.medium ?? img.urls?.small });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : `Could not upload the ${label.toLowerCase()}.`, "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="relative flex flex-wrap items-center gap-4">
      <Frame src={broken ? undefined : value?.url} alt={label} round={round} onBroken={() => setBroken(true)} />
      <div className="min-w-0 flex-1 basis-40 space-y-2">
        <input ref={input} type="file" accept={TYPES.join(",")} className="sr-only" aria-label={`Choose ${label.toLowerCase()}`} onChange={(e) => void pick(e.target.files?.[0])} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Uploading…" : value ? `Change ${label.toLowerCase()}` : `Choose ${label.toLowerCase()}`}
          </Button>
          {value && (
            <Button variant="ghost" disabled={busy} onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted">Optional. JPEG, PNG or WebP, up to 10 MB.</p>
      </div>
    </div>
  );
}
