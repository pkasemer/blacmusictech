"use client";

import { useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { VERIFY_CATEGORIES, buildChanges, bulkError, emptyForm, skipReason, valueName, versionsOf, type BulkAnswer, type BulkForm, type BulkMode, type VerifyCategory } from "@/lib/bulkMetadata";
import { offered, termLabel, type Taxonomy } from "@/lib/metadata";
import { Modal } from "./Dialogs";
import { MultiSelect, type Option } from "./MultiSelect";
import { useToast } from "./Shell";
import { Badge, Button, ErrorBox, Select } from "./ui";

/** Appears once tracks are ticked. */
export function BulkBar({ count, onChange, onVerify, onClear }: { count: number; onChange: () => void; onVerify: () => void; onClear: () => void }) {
  if (count === 0) return null;
  return (
    <div role="region" aria-label="Selected tracks" className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-primary/30 bg-primary-soft px-3 py-2 text-sm">
      <span className="font-medium" aria-live="polite">
        {count} track{count === 1 ? "" : "s"} selected
      </span>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button small onClick={onClear}>
          Clear
        </Button>
        <Button small onClick={onVerify}>
          Verify…
        </Button>
        <Button small variant="primary" onClick={onChange}>
          Add or replace metadata…
        </Button>
      </div>
    </div>
  );
}

export type BulkKind = "change" | "verify";

export function BulkDialog({ kind, trackIds, tax, onClose, onApplied }: { kind: BulkKind | null; trackIds: string[]; tax: Taxonomy; onClose: () => void; onApplied: () => void }) {
  return (
    <Modal open={!!kind} title={kind === "verify" ? `Verify metadata of ${trackIds.length} tracks` : `Change metadata of ${trackIds.length} tracks`} onClose={onClose} wide>
      {kind && <Steps kind={kind} trackIds={trackIds} tax={tax} onClose={onClose} onApplied={onApplied} />}
    </Modal>
  );
}

/** Choose, see exactly what would happen to each track, then apply that and nothing else. */
function Steps({ kind, trackIds, tax, onClose, onApplied }: { kind: BulkKind; trackIds: string[]; tax: Taxonomy; onClose: () => void; onApplied: () => void }) {
  const toast = useToast();
  // fixed while the dialog is open: what is previewed is what is applied
  const [ids] = useState(trackIds);
  const [form, setForm] = useState<BulkForm>(emptyForm);
  const [categories, setCategories] = useState<VerifyCategory[]>([]);
  const [preview, setPreview] = useState<BulkAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changes = buildChanges(form);
  const ready = kind === "verify" ? categories.length > 0 : !!changes;
  const path = kind === "verify" ? "/metadata/bulk-verify" : "/metadata/bulk";
  const what = kind === "verify" ? { categories } : { changes };

  async function send(dryRun: boolean) {
    setBusy(true);
    setError("");
    try {
      const answer = await api<BulkAnswer>(path, { method: "POST", body: { trackIds: ids, dryRun, ...what, ...(dryRun ? {} : { versions: versionsOf(preview!) }) } });
      if (dryRun) setPreview(answer);
      else {
        toast(`${kind === "verify" ? "Verified" : "Updated"} ${answer.changed} track${answer.changed === 1 ? "" : "s"}`);
        onApplied();
        onClose();
      }
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "error", "Something went wrong.");
      setError(bulkError(err.code, err.status, err.message));
      if (err.code === "stale_version") setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!preview && kind === "verify" && (
        <fieldset className="space-y-1.5 text-sm">
          <legend className="mb-2 text-muted">Tick what you have checked. Only values not yet verified in those categories are verified; rejected ones stay rejected.</legend>
          {VERIFY_CATEGORIES.map((c) => (
            <label key={c.key} className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-primary" checked={categories.includes(c.key)} onChange={(e) => setCategories((old) => (e.target.checked ? [...old, c.key] : old.filter((k) => k !== c.key)))} />
              {c.label}
            </label>
          ))}
        </fieldset>
      )}

      {!preview && kind === "change" && (
        <>
          <p className="text-sm text-muted">Tick only what you want to change. Anything not ticked stays as it is on every track.</p>
          <Block title="Languages" on={form.languages.on} mode={form.languages.mode} onToggle={(on) => setForm({ ...form, languages: { ...form.languages, on } })} onMode={(mode) => setForm({ ...form, languages: { ...form.languages, mode } })}>
            <Picker label="Languages" options={offered(tax.languages, []).map((t) => ({ id: t.id, label: t.label, group: tax.languageGroups.find((g) => g.id === t.groupId)?.label }))} value={form.languages.ids} onChange={(v) => setForm({ ...form, languages: { ...form.languages, ids: v, primary: v.includes(form.languages.primary) ? form.languages.primary : "" } })} />
            <Primary label="Primary language" ids={form.languages.ids} value={form.languages.primary} name={(id) => termLabel(tax.languages, id)} onChange={(primary) => setForm({ ...form, languages: { ...form.languages, primary } })} />
          </Block>
          <Block title="Genres" on={form.genres.on} mode={form.genres.mode} onToggle={(on) => setForm({ ...form, genres: { ...form.genres, on } })} onMode={(mode) => setForm({ ...form, genres: { ...form.genres, mode } })}>
            <Picker label="Genres" options={offered(tax.genres, []).map((t) => ({ id: t.id, label: t.label }))} value={form.genres.ids} onChange={(v) => setForm({ ...form, genres: { ...form.genres, ids: v, primary: v.includes(form.genres.primary) ? form.genres.primary : "" } })} />
            <Primary label="Primary genre" ids={form.genres.ids} value={form.genres.primary} name={(id) => termLabel(tax.genres, id)} onChange={(primary) => setForm({ ...form, genres: { ...form.genres, primary } })} />
          </Block>
          <Block title="Regions" on={form.regions.on} mode={form.regions.mode} onToggle={(on) => setForm({ ...form, regions: { ...form.regions, on } })} onMode={(mode) => setForm({ ...form, regions: { ...form.regions, mode } })}>
            <Picker label="Regions" options={offered(tax.regions, []).map((t) => ({ id: t.id, label: t.label }))} value={form.regions.ids} onChange={(v) => setForm({ ...form, regions: { ...form.regions, ids: v } })} />
          </Block>
        </>
      )}

      {preview && (
        <div>
          <p className="mb-2 text-sm font-medium" role="status">
            {preview.changed} will change, {preview.unchanged} stay the same{preview.skipped ? `, ${preview.skipped} skipped` : ""}. Nothing has been applied yet.
          </p>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-control border border-line text-sm">
            {preview.results.map((r) => (
              <li key={r.trackId} className="px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{r.title}</span>
                  <Badge tone={r.outcome === "changed" ? "blue" : r.outcome === "skipped" ? "amber" : "gray"}>{r.outcome === "changed" ? "Will change" : r.outcome === "skipped" ? "Skipped" : "No change"}</Badge>
                </div>
                {r.outcome === "skipped" && <p className="text-xs text-warning-ink">{skipReason(r.reason)}</p>}
                {!!r.removed?.length && <p className="text-xs font-medium text-danger-ink">Removes: {r.removed.map((v) => valueName(v, tax)).join(", ")}</p>}
                {!!r.added?.length && <p className="text-xs text-success-ink">Adds: {r.added.map((v) => valueName(v, tax)).join(", ")}</p>}
                {!!r.primaryChanged?.length && <p className="text-xs text-muted">Changes which is primary: {r.primaryChanged.join(", ")}</p>}
                {!!r.verified?.length && <p className="text-xs text-success-ink">Verifies: {r.verified.map((v) => valueName(v, tax)).join(", ")}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        {preview ? (
          <>
            <Button disabled={busy} onClick={() => setPreview(null)}>
              Back
            </Button>
            <Button variant="primary" disabled={busy || preview.changed === 0} onClick={() => void send(false)}>
              {busy ? "Applying…" : `${kind === "verify" ? "Verify" : "Apply to"} ${preview.changed} track${preview.changed === 1 ? "" : "s"}`}
            </Button>
          </>
        ) : (
          <Button variant="primary" disabled={!ready || busy} onClick={() => void send(true)}>
            {busy ? "Checking…" : "Preview"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Block({ title, on, mode, onToggle, onMode, children }: { title: string; on: boolean; mode: BulkMode; onToggle: (on: boolean) => void; onMode: (m: BulkMode) => void; children: ReactNode }) {
  return (
    <section className="rounded-control border border-line p-3">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" className="size-4 accent-primary" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        Change {title.toLowerCase()}
      </label>
      {on && (
        <div className="mt-3 space-y-3">
          <fieldset className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <legend className="sr-only">How to change {title.toLowerCase()}</legend>
            {(["add", "replace"] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5">
                <input type="radio" className="accent-primary" name={`mode-${title}`} checked={mode === m} onChange={() => onMode(m)} />
                {m === "add" ? "Add to what is there" : "Replace what is there"}
              </label>
            ))}
          </fieldset>
          {children}
        </div>
      )}
    </section>
  );
}

function Picker({ label, options, value, onChange }: { label: string; options: Option[]; value: string[]; onChange: (ids: string[]) => void }) {
  return <MultiSelect label={label} options={options} value={value} onChange={onChange} emptyText="Choose at least one" />;
}

function Primary({ label, ids, value, name, onChange }: { label: string; ids: string[]; value: string; name: (id: string) => string; onChange: (id: string) => void }) {
  if (ids.length === 0) return null;
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      {label}
      <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Do not set one</option>
        {ids.map((id) => (
          <option key={id} value={id}>
            {name(id)}
          </option>
        ))}
      </Select>
      <span className="text-xs text-muted">When adding, a track that already has a primary keeps it.</span>
    </label>
  );
}
