"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Button, ErrorBox, Field, Input, Loading, Textarea } from "./ui";

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] rounded-xl border border-line bg-white p-0 shadow-xl backdrop:bg-black/40 ${wide ? "max-w-2xl" : "max-w-lg"}`}
    >
      {open && (
        <div className="p-5">
          <h2 id={titleId} className="mb-3 text-lg font-semibold">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

function errText(e: unknown): string {
  return e instanceof ApiError ? e.message : "Something went wrong.";
}

/** Asks for a reason (required, 3+ characters) before an action such as a ban or takedown. */
export function ReasonDialog(props: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  reasonLabel?: string;
  required?: boolean;
  danger?: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  return (
    <Modal open={props.open} title={props.title} onClose={props.onClose}>
      {props.open && <ReasonForm {...props} />}
    </Modal>
  );
}

function ReasonForm({ description, confirmLabel, reasonLabel = "Reason", required = true, danger, onClose, onSubmit }: Parameters<typeof ReasonDialog>[0]) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const valid = !required || reason.trim().length >= 3;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        setError("");
        try {
          await onSubmit(reason.trim());
          onClose();
        } catch (err) {
          setError(errText(err));
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="text-sm text-muted">{description}</div>
      <Field label={reasonLabel} htmlFor={id} hint={required ? "At least 3 characters. This is saved in the audit log." : "Saved in the audit log."}>
        <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
      {error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant={danger ? "danger" : "primary"} disabled={!valid || busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </form>
  );
}

/**
 * Deletion confirmation. Shows what will be removed (from the Backend's deletion preview), asks for a reason
 * and for the exact name/email of the thing being deleted before the button works.
 */
export function DeleteDialog<P>(props: {
  open: boolean;
  title: string;
  previewPath: string;
  describe: (p: P) => string[];
  confirmValue: string;
  confirmHint: string;
  onClose: () => void;
  onDelete: (reason: string) => Promise<void>;
}) {
  return (
    <Modal open={props.open} title={props.title} onClose={props.onClose} wide>
      {props.open && <DeleteForm {...props} />}
    </Modal>
  );
}

function DeleteForm<P>({ previewPath, describe, confirmValue, confirmHint, onClose, onDelete }: Parameters<typeof DeleteDialog<P>>[0]) {
  const preview = useApi<P>(previewPath);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idA = useId();
  const idB = useId();
  const ready = !!preview.data && typed === confirmValue && reason.trim().length >= 3;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError("");
        try {
          await onDelete(reason.trim());
          onClose();
        } catch (err) {
          setError(errText(err));
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        <p className="mb-2 font-medium">This permanently removes, and cannot be undone:</p>
        {preview.loading && !preview.data && <Loading label="Checking what will be removed…" />}
        {preview.error && <ErrorBox error={preview.error} onRetry={preview.reload} />}
        {preview.data && (
          <ul className="list-disc space-y-0.5 pl-5">
            {describe(preview.data).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </div>
      <Field label={confirmHint} htmlFor={idA}>
        <Input id={idA} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} placeholder={confirmValue} />
      </Field>
      <Field label="Reason" htmlFor={idB} hint="At least 3 characters. This is saved in the audit log.">
        <Textarea id={idB} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="danger" disabled={!ready || busy}>
          {busy ? "Deleting…" : "Delete permanently"}
        </Button>
      </div>
    </form>
  );
}
