"use client";

import { useId, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { Modal } from "./Dialogs";
import { Button, ErrorBox, Field, Input } from "./ui";

/** Asks the administrator to type a name before something is removed (no reason needed). */
export function ConfirmNameDialog(props: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmValue: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Modal open={props.open} title={props.title} onClose={props.onClose}>
      {props.open && <Form {...props} />}
    </Modal>
  );
}

function Form({ description, confirmValue, confirmLabel, onClose, onConfirm }: Parameters<typeof ConfirmNameDialog>[0]) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (typed !== confirmValue || busy) return;
        setBusy(true);
        setError("");
        try {
          await onConfirm();
          onClose();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Something went wrong.");
          setBusy(false);
        }
      }}
    >
      <div className="text-sm text-muted">{description}</div>
      <Field label={`Type ${confirmValue} to confirm`} htmlFor={id}>
        <Input id={id} value={typed} autoComplete="off" spellCheck={false} placeholder={confirmValue} onChange={(e) => setTyped(e.target.value)} autoFocus />
      </Field>
      {error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="danger" disabled={typed !== confirmValue || busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </form>
  );
}

/** A plain "are you sure" for an action that takes no reason and no typed name. */
export function ConfirmDialog(props: { open: boolean; title: string; description: ReactNode; confirmLabel: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  return (
    <Modal open={props.open} title={props.title} onClose={props.onClose}>
      {props.open && <Ask {...props} />}
    </Modal>
  );
}

function Ask({ description, confirmLabel, onClose, onConfirm }: Parameters<typeof ConfirmDialog>[0]) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted">{description}</div>
      {error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} autoFocus>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError(e instanceof ApiError ? e.message : "Something went wrong.");
              setBusy(false);
            }
          }}
        >
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
