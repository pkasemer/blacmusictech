"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { runBulk, settled, summary, type BulkItem, type BulkResult } from "@/lib/bulk";
import { Modal } from "./Dialogs";
import { Badge, Button, ErrorBox, Field, Input, Progress } from "./ui";

/** The ticked releases. They stay ticked while the person changes page or filters. */
export function useSelection() {
  const [map, setMap] = useState<ReadonlyMap<string, BulkItem>>(() => new Map());
  const set = useCallback((items: BulkItem[], on: boolean) => {
    setMap((old) => {
      const next = new Map(old);
      for (const i of items) {
        if (on) next.set(i.id, { id: i.id, title: i.title, artistName: i.artistName });
        else next.delete(i.id);
      }
      return next;
    });
  }, []);
  const remove = useCallback((ids: string[]) => {
    setMap((old) => {
      const next = new Map(old);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);
  const clear = useCallback(() => setMap(new Map()), []);
  return { items: [...map.values()], has: (id: string) => map.has(id), set, remove, clear };
}

export function SelectBox({ checked, mixed, disabled, label, onChange }: { checked: boolean; mixed?: boolean; disabled?: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <input
      type="checkbox"
      className="size-4 accent-primary align-middle disabled:cursor-not-allowed disabled:opacity-40"
      aria-label={label}
      title={label}
      checked={checked}
      disabled={disabled}
      ref={(el) => {
        if (el) el.indeterminate = !!mixed && !checked;
      }}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

export function SelectionBar({ count, hidden, onPublish, onClear }: { count: number; hidden?: number; onPublish: () => void; onClear: () => void }) {
  if (count === 0) return null;
  return (
    <div role="region" aria-label="Selected releases" className="mb-3 flex flex-wrap items-center gap-3 rounded-control border border-primary/30 bg-primary-soft px-3 py-2 text-sm">
      <span className="font-medium" aria-live="polite">
        {count} selected{hidden ? ` (${hidden} not shown here)` : ""}
      </span>
      <div className="ml-auto flex gap-2">
        <Button small onClick={onClear}>
          Clear
        </Button>
        <Button small variant="primary" onClick={onPublish}>
          Publish {count}
        </Button>
      </div>
    </div>
  );
}

export function BulkPublishDialog({ open, items, onClose, onFinished }: { open: boolean; items: BulkItem[]; onClose: () => void; onFinished: (settledIds: string[]) => void }) {
  const [running, setRunning] = useState(false);
  return (
    <Modal open={open} title="Publish releases" onClose={onClose} wide dismissable={!running}>
      {open && <BulkForm initial={items} running={running} setRunning={setRunning} onClose={onClose} onFinished={onFinished} />}
    </Modal>
  );
}

function BulkForm({ initial, running, setRunning, onClose, onFinished }: { initial: BulkItem[]; running: boolean; setRunning: (v: boolean) => void; onClose: () => void; onFinished: (ids: string[]) => void }) {
  // the list is fixed while the dialog is open: published releases leave the selection behind it
  const [items] = useState(initial);
  const [mode, setMode] = useState<"now" | "later">("now");
  const [when, setWhen] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [stopping, setStopping] = useState(false);
  const stop = useRef(false);
  const idW = useId();
  useEffect(
    () => () => {
      stop.current = true; // leaving the page stops after the request in flight
    },
    [],
  );
  const finished = !!results && !running;
  const byId = new Map((results ?? []).map((r) => [r.item.id, r]));

  async function start() {
    if (mode === "later" && !(new Date(when).getTime() > Date.now())) {
      setError("Pick a time in the future.");
      return;
    }
    const body = mode === "later" ? { publishAt: new Date(when).toISOString() } : {};
    setError("");
    setResults([]);
    setRunning(true);
    stop.current = false;
    const all = await runBulk(
      items,
      (i) => api(`/releases/${i.id}/publish`, { method: "POST", body }),
      (r) => setResults((old) => [...(old ?? []), r]),
      () => stop.current,
    );
    setRunning(false);
    onFinished(settled(all));
  }

  return (
    <div className="space-y-4">
      {!results && (
        <fieldset className="space-y-2 text-sm">
          <legend className="sr-only">When</legend>
          <label className="flex items-start gap-2">
            <input type="radio" className="mt-1 accent-primary" name="bulk-when" checked={mode === "now"} onChange={() => setMode("now")} />
            <span>
              <span className="font-medium">Publish now</span>
              <span className="block text-xs text-muted">Listeners can find all of them right away.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" className="mt-1 accent-primary" name="bulk-when" checked={mode === "later"} onChange={() => setMode("later")} />
            <span>
              <span className="font-medium">Schedule</span>
              <span className="block text-xs text-muted">All of them go live at the same date and time.</span>
            </span>
          </label>
          {mode === "later" && (
            <Field label="Goes live at" htmlFor={idW}>
              <Input id={idW} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
          )}
        </fieldset>
      )}
      {results && (
        <div>
          <Progress label="Publishing progress" value={(results.length / items.length) * 100} />
          <p className="mt-1.5 text-sm font-medium" role="status">
            {finished ? summary(results, mode === "later") : `Working on ${Math.min(results.length + 1, items.length)} of ${items.length}…`}
          </p>
        </div>
      )}
      <ul className="relative max-h-72 divide-y divide-line overflow-y-auto rounded-control border border-line text-sm">
        {items.map((i) => {
          const r = byId.get(i.id);
          return (
            <li key={i.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <Link href={`/releases/${i.id}`} target="_blank" className="block truncate font-medium hover:text-primary">
                  {i.title}
                </Link>
                <div className="truncate text-xs text-muted">{i.artistName}</div>
                {r?.message && <div className="mt-0.5 text-xs text-danger-ink">{r.message}</div>}
              </div>
              {r && (
                <Badge tone={r.outcome === "done" ? "green" : r.outcome === "failed" ? "red" : "gray"}>
                  {r.outcome === "done" ? (mode === "later" ? "Scheduled" : "Published") : r.outcome === "failed" ? "Failed" : "Not tried"}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
      {!results && <p className="text-xs text-muted">Each one is checked on its own. Any that cannot be published is listed with the reason, and the others still go ahead.</p>}
      {error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        {!results && (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={items.length === 0 || (mode === "later" && !when)} onClick={() => void start()}>
              {mode === "later" ? `Schedule ${items.length}` : `Publish ${items.length} now`}
            </Button>
          </>
        )}
        {running && (
          <Button
            disabled={stopping}
            onClick={() => {
              stop.current = true;
              setStopping(true);
            }}
          >
            {stopping ? "Stopping…" : "Stop after this one"}
          </Button>
        )}
        {finished && (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
}
