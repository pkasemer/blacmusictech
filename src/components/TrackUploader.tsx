"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { fmtBytes } from "@/lib/format";
import type { UploadItem } from "@/lib/types";
import { acceptable, runUpload, titleFromFilename } from "@/lib/upload";
import { cancelUpload, uploadIO, uploadStatus } from "@/lib/upload-io";
import { ICheck, IAlert, IMusic, ITrash, IUpload } from "./icons";
import { Badge, Button, IconButton, Input, Progress, cx } from "./ui";

type State = "waiting" | "uploading" | "processing" | "ready" | "failed";
interface Item {
  key: string;
  file: File;
  title: string;
  explicit: boolean;
  state: State;
  progress: number;
  error?: string;
}

/**
 * Adds audio to a release: drop files, check the title of each, confirm the rights, and upload. Each file is sent in
 * parts through this site's server; the Backend then converts it and the track appears in the release.
 */
export function TrackUploader({
  releaseId,
  nextTrackNumber,
  genre,
  pending,
  onChanged,
}: {
  releaseId: string;
  nextTrackNumber: number;
  genre?: string;
  /** uploads the Backend knows about that are not tracks yet (they survive a reload) */
  pending: UploadItem[];
  onChanged: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [rights, setRights] = useState(false);
  const [drag, setDrag] = useState(false);
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const started = useRef(0);
  const id = useId();

  const patch = (key: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...p } : i)));

  function add(files: FileList | File[]) {
    const skipped: string[] = [];
    const next: Item[] = [];
    for (const f of Array.from(files)) {
      const why = acceptable(f);
      if (why) {
        skipped.push(`${f.name} ${why}`);
        continue;
      }
      next.push({ key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`, file: f, title: titleFromFilename(f.name), explicit: false, state: "waiting", progress: 0 });
    }
    setNotice(skipped.length ? `Skipped: ${skipped.join("; ")}.` : "");
    if (next.length) setItems((cur) => [...cur, ...next]);
  }

  async function processOne(it: Item, trackNumber: number) {
    patch(it.key, { state: "uploading", progress: 0, error: undefined });
    try {
      const uploadId = await runUpload(it.file, { releaseId, title: it.title.trim() || it.file.name, trackNumber, explicit: it.explicit, genre }, uploadIO, {
        onProgress: (f) => patch(it.key, { progress: f }),
      });
      patch(it.key, { state: "processing", progress: 1 });
      // the Backend converts the audio into the listening qualities; wait for it
      for (let i = 0; i < 300; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const s = await uploadStatus(uploadId);
        if (s.status === "ready") {
          patch(it.key, { state: "ready" });
          onChanged();
          return;
        }
        if (s.status === "failed") throw new ApiError(0, "failed", s.error || "The audio could not be processed.");
      }
      throw new ApiError(0, "timeout", "Processing is taking longer than expected. Check the release again in a minute.");
    } catch (e) {
      patch(it.key, { state: "failed", error: e instanceof ApiError ? e.message : (e as Error).message || "The upload failed." });
      onChanged();
    }
  }

  async function startAll(current: Item[]) {
    if (running.current) return;
    running.current = true;
    try {
      for (const it of current.filter((x) => x.state === "waiting")) {
        await processOne(it, nextTrackNumber + started.current);
        started.current++;
      }
    } finally {
      running.current = false;
    }
  }

  // keep the list of pending uploads fresh while the Backend is working on them
  const busyOnServer = pending.some((p) => p.status === "queued" || p.status === "processing");
  useEffect(() => {
    if (!busyOnServer) return;
    const t = setInterval(onChanged, 3000);
    return () => clearInterval(t);
  }, [busyOnServer, onChanged]);

  const waiting = items.filter((i) => i.state === "waiting").length;
  const active = items.some((i) => i.state === "uploading" || i.state === "processing");
  // uploads this page is already showing above (same file) are not listed a second time
  const others = pending.filter((p) => !items.some((i) => i.state !== "waiting" && i.file.name === p.filename && i.file.size === p.sizeBytes));

  return (
    <div className="space-y-3">
      <label
        htmlFor={id}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        className={cx("relative flex cursor-pointer flex-col items-center gap-1.5 rounded-card border border-dashed px-4 py-7 text-center text-sm", drag ? "border-primary bg-primary-soft" : "border-line bg-panel hover:border-[#c9c9d0]")}
      >
        <IUpload size={20} className="text-muted" />
        <span className="font-medium">Drop audio files here, or choose them</span>
        <span className="text-xs text-muted">MP3, WAV, FLAC, M4A or similar, up to 2 GB each. Several at once is fine.</span>
        <input id={id} ref={input} type="file" multiple accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.aif,.aiff" className="sr-only" onChange={(e) => (add(e.target.files ?? []), (e.target.value = ""))} />
      </label>
      {notice && <p role="status" className="text-xs text-warning-ink">{notice}</p>}

      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-card border border-line bg-panel">
          {items.map((it) => (
            <li key={it.key} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-creative/10 text-creative-ink">
                <IMusic size={15} />
              </span>
              <div className="min-w-0 flex-1 basis-48">
                {it.state === "waiting" ? (
                  <Input aria-label={`Title for ${it.file.name}`} value={it.title} maxLength={200} onChange={(e) => patch(it.key, { title: e.target.value })} />
                ) : (
                  <div className="truncate font-medium">{it.title}</div>
                )}
                <div className="mt-0.5 truncate text-[11px] text-muted">
                  {it.file.name} · {fmtBytes(it.file.size)}
                </div>
                {it.state === "uploading" && (
                  <div className="mt-1.5">
                    <Progress value={it.progress * 100} label={`Uploading ${it.title}`} />
                  </div>
                )}
                {it.error && <div className="mt-1 text-xs text-danger-ink">{it.error}</div>}
              </div>
              {it.state === "waiting" && (
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" className="accent-primary" checked={it.explicit} onChange={(e) => patch(it.key, { explicit: e.target.checked })} /> Explicit
                </label>
              )}
              <span className="w-28 text-right text-xs">
                {it.state === "waiting" && <Badge>Waiting</Badge>}
                {it.state === "uploading" && <span className="tabular-nums text-muted">{Math.round(it.progress * 100)}%</span>}
                {it.state === "processing" && <Badge tone="blue">Processing…</Badge>}
                {it.state === "ready" && (
                  <Badge tone="green">
                    <ICheck size={11} /> Added
                  </Badge>
                )}
                {it.state === "failed" && (
                  <Badge tone="red">
                    <IAlert size={11} /> Failed
                  </Badge>
                )}
              </span>
              {(it.state === "waiting" || it.state === "failed" || it.state === "ready") && (
                <IconButton small label={`Remove ${it.title} from the list`} onClick={() => setItems((c) => c.filter((x) => x.key !== it.key))}>
                  <ITrash size={14} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <ul className="divide-y divide-line rounded-card border border-line bg-panel">
          {others.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{p.title}</span> <span className="text-xs text-muted">{p.filename}</span>
              </span>
              {p.status === "failed" ? <Badge tone="red">Failed{p.error ? `: ${p.error}` : ""}</Badge> : p.status === "pending" ? <Badge>Not finished</Badge> : <Badge tone="blue">Processing…</Badge>}
              {(p.status === "failed" || p.status === "pending") && (
                <IconButton
                  small
                  label={`Discard ${p.title}`}
                  onClick={async () => {
                    try {
                      await cancelUpload(p.id);
                    } finally {
                      onChanged();
                    }
                  }}
                >
                  <ITrash size={14} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-0 flex-1 basis-72 items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5 accent-primary" checked={rights} onChange={(e) => setRights(e.target.checked)} />
            <span>I confirm that Blac Music has the rights or the artist&rsquo;s permission to publish these recordings. This is recorded in the audit log.</span>
          </label>
          <Button variant="primary" disabled={!rights || waiting === 0 || active} onClick={() => void startAll(items)}>
            <IUpload size={14} /> {active ? "Uploading…" : `Upload ${waiting} file${waiting === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
    </div>
  );
}
