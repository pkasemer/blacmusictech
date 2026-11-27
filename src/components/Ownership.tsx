"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { api, ApiError, qs } from "@/lib/api";
import { cannotReceive, ownershipError } from "@/lib/ownership";
import type { ArtistDetail, UserList, UserRow } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";
import { Modal, ReasonDialog } from "./Dialogs";
import { Button, ErrorBox, Field, Loading, SearchField, Textarea, cx } from "./ui";

function explain(e: unknown): ApiError {
  const err = e instanceof ApiError ? e : new ApiError(0, "error", "Something went wrong.");
  return new ApiError(err.status, err.code, ownershipError(err.code, err.message));
}

/** Gives a catalog artist to a person who signed up: find their account, check it is them, record how you know. */
export function TransferDialog({ open, a, onClose, onDone }: { open: boolean; a: ArtistDetail; onClose: () => void; onDone: (email: string) => void }) {
  return (
    <Modal open={open} title={`Transfer ${a.name} to a user`} onClose={onClose} wide>
      {open && <TransferForm a={a} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function TransferForm({ a, onClose, onDone }: { a: ArtistDetail; onClose: () => void; onDone: (email: string) => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<UserRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const term = useDebounced(q.trim());
  const searching = term.length >= 2;
  const users = useApi<UserList>(searching ? `/users${qs({ q: term, limit: 8 })}` : null);
  const idR = useId();
  const ready = !!picked && reason.trim().length >= 3;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError("");
        try {
          await api(`/artists/${a.id}/owner`, { method: "POST", body: { userId: picked.id, reason: reason.trim() } });
          onDone(picked.email);
          onClose();
        } catch (err) {
          setError(explain(err).message);
          setBusy(false);
        }
      }}
    >
      {!picked ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">Find the account the artist signed up with. Check the email address with them: whoever receives the artist controls its songs.</p>
          <SearchField aria-label="Find the account by email or name" placeholder="Email or name" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {searching && users.error && <ErrorBox error={users.error} onRetry={users.reload} />}
          {searching && users.loading && <Loading rows={2} />}
          {searching && !users.loading && users.data && (
            <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-control border border-line text-sm" aria-label="Matching accounts">
              {users.data.users.length === 0 && <li className="px-3 py-3 text-muted">No account matches. The artist needs to sign up in the app first.</li>}
              {users.data.users.map((u) => {
                const why = cannotReceive(u);
                return (
                  <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className={cx("truncate font-medium", why && "text-muted")}>{u.email}</div>
                      <div className="truncate text-xs text-muted">
                        {u.displayName}
                        {why && <span className="text-warning-ink"> · {why}</span>}
                      </div>
                    </div>
                    {why ? (
                      <Link href={`/users/${u.id}`} className="shrink-0 text-xs text-primary hover:underline">
                        See account
                      </Link>
                    ) : (
                      <Button small onClick={() => setPicked(u)} aria-label={`Choose ${u.email}`}>
                        Choose
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {searching && users.data?.users.some((u) => u.hasArtist) && (
            <p className="text-xs text-muted">If their artist profile is an empty one made while signing up, open it from their account and delete it first. Their account is kept.</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 rounded-control border border-primary/30 bg-primary-soft px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-semibold">{picked.email}</div>
              <div className="truncate text-xs text-muted">{picked.displayName}</div>
            </div>
            <Button small onClick={() => setPicked(null)}>
              Change
            </Button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>This person will manage the artist in the app. They can edit and delete its releases and songs, including the ones your team uploaded.</li>
            <li>Releases stay as they are now.</li>
            <li>They get the normal storage allowance. Songs your team has already uploaded do not count against it. Anything uploaded from now on does, including uploads by your team.</li>
            <li>If their account already has a profile picture, the artist will show that one.</li>
            <li>If they delete their account, the artist returns to the catalog with the songs your team uploaded.</li>
          </ul>
          <Field label="How did you check this is the artist?" htmlFor={idR} hint="At least 3 characters. This is saved in the audit log.">
            <Textarea id={idR} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
        </>
      )}
      {error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!ready || busy}>
          {busy ? "Working…" : "Transfer artist"}
        </Button>
      </div>
    </form>
  );
}

export function RemoveOwnerDialog({ open, a, onClose, onDone }: { open: boolean; a: ArtistDetail; onClose: () => void; onDone: () => void }) {
  const email = a.owner?.email ?? "this account";
  return (
    <ReasonDialog
      open={open}
      title={`Remove ${a.name} from ${email}?`}
      description={
        <ul className="list-disc space-y-1 pl-5">
          <li>They keep their account but can no longer manage this artist.</li>
          <li>The artist goes back to the catalog for your team to manage. Releases stay as they are, so published ones stay public.</li>
          <li>Uploads they had not finished sending, and failed ones, are dropped, and their song transfers are cancelled. Files already waiting to be processed still become songs.</li>
          <li>A verified badge stays. Revoke it separately if it belonged to this person.</li>
        </ul>
      }
      confirmLabel="Remove from user"
      danger
      onClose={onClose}
      onSubmit={async (reason) => {
        try {
          await api(`/artists/${a.id}/owner`, { method: "DELETE", body: { reason } });
        } catch (e) {
          throw explain(e);
        }
        onDone();
      }}
    />
  );
}
