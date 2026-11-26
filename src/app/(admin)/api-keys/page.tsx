"use client";

import { useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Dialogs";
import { ICheck, ICopy, IKey, IPlus, IShieldAlert } from "@/components/icons";
import { useToast } from "@/components/Shell";
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { keyState, type ApiKey, type ApiKeyList, type CreatedApiKey } from "@/lib/imports";
import { useApi } from "@/lib/useApi";

const EXPIRY = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

const WARNING =
  "Whoever has this key can import songs until it expires or you revoke it: it can create artists and releases, and can publish them to listeners straight away. It opens nothing else (no accounts, no other admin pages).";

function CreateForm({ onCreated, onClose }: { onCreated: (k: CreatedApiKey) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const a = useId();
  const b = useId();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || busy) return;
        setBusy(true);
        setError("");
        try {
          onCreated(await api<CreatedApiKey>("/api-keys", { method: "POST", body: { name: name.trim(), expiresInDays: days } }));
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not create the key.");
          setBusy(false);
        }
      }}
    >
      <div className="flex gap-2.5 rounded-control border border-warning/40 bg-warning/10 p-3 text-sm text-warning-ink">
        <IShieldAlert size={18} className="mt-0.5 shrink-0" />
        <p>{WARNING}</p>
      </div>
      <Field label="Name" htmlFor={a} hint="What or who will use it, so you can recognise and revoke it later (1–60 characters)">
        <Input id={a} value={name} maxLength={60} autoFocus placeholder="LuoTunes loader" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Expires after" htmlFor={b} hint="Choose the shortest time the job needs. A running import finishes even if its key expires.">
        <Select id={b} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {EXPIRY.map((x) => (
            <option key={x.days} value={x.days}>
              {x.label}
            </option>
          ))}
        </Select>
      </Field>
      {error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!name.trim() || busy}>
          {busy ? "Creating…" : "Create key"}
        </Button>
      </div>
    </form>
  );
}

/** The only time the whole key is visible. It lives in this component's state and nowhere else. */
function Reveal({ created, onDone }: { created: CreatedApiKey; onDone: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const id = useId();
  async function copy() {
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
      toast("Key copied");
    } catch {
      input.current?.select();
      toast("Select the key and copy it by hand.", "error");
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm">
        Copy the key for <strong>{created.name}</strong> now. <strong>You will not be able to see it again</strong>: the server keeps only a fingerprint of it. It expires {fmtDateTime(created.expiresAt)}.
      </p>
      <Field label="Import key" htmlFor={id} hint="Send it as  Authorization: Bearer <key>. Give it to the script, never your password, and do not put it in chat, email or code.">
        <div className="flex gap-2">
          <Input id={id} ref={input} readOnly value={created.key} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} autoComplete="off" spellCheck={false} data-1p-ignore data-lpignore="true" />
          <Button variant="primary" onClick={copy}>
            {copied ? <ICheck size={14} /> : <ICopy size={14} />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 accent-primary" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have saved the key somewhere safe.
      </label>
      <div className="flex justify-end">
        <Button variant="primary" disabled={!saved} onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

function StateBadge({ k }: { k: ApiKey }) {
  const s = keyState(k);
  return s === "active" ? <Badge tone="green">Active</Badge> : s === "expired" ? <Badge>Expired</Badge> : <Badge tone="red">Revoked</Badge>;
}

export default function ApiKeysPage() {
  const q = useApi<ApiKeyList>("/api-keys");
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const keys = q.data?.keys ?? [];
  const active = keys.filter((k) => keyState(k) === "active").length;

  return (
    <>
      <PageHeader
        title="API keys"
        subtitle="Keys let a script import songs without your password. A key opens only the bulk import routes."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <IPlus size={14} /> New key
          </Button>
        }
      />
      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}
      {!q.data && !q.error && <Loading />}
      {q.data && keys.length === 0 && <Empty icon={<IKey size={20} />}>No keys yet. Create one when a script needs to import a catalogue.</Empty>}
      {keys.length > 0 && (
        <>
          <p className="mb-2 text-xs text-muted">
            {active} active key{active === 1 ? "" : "s"}. Revoke any key you do not recognise or no longer need.
          </p>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>State</Th>
                <Th>Last used</Th>
                <Th>Expires</Th>
                <Th>Created by</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const s = keyState(k);
                return (
                  <tr key={k.id} className={s === "active" ? "hover:bg-sunken/50" : "text-muted"}>
                    <Td>
                      <div className="font-medium">{k.name}</div>
                      <code className="text-[11px] text-muted">{k.prefix}…</code>
                    </Td>
                    <Td>
                      <StateBadge k={k} />
                      {k.revokedAt && <div className="mt-0.5 text-[11px] text-muted">{fmtDateTime(k.revokedAt)}</div>}
                    </Td>
                    <Td>{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : <span className="text-muted">Never</span>}</Td>
                    <Td>{fmtDate(k.expiresAt)}</Td>
                    <Td>
                      <div>{k.createdBy}</div>
                      <div className="text-[11px] text-muted">{fmtDate(k.createdAt)}</div>
                    </Td>
                    <Td className="text-right">
                      {!k.revokedAt && (
                        <Button small variant="ghost" className="text-danger-ink hover:bg-danger/10 hover:text-danger-ink" aria-label={`Revoke ${k.name}`} onClick={() => setRevoking(k)}>
                          Revoke
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </>
      )}

      <Modal open={creating} title="New import key" onClose={() => setCreating(false)} wide>
        {creating && (
          <CreateForm
            onClose={() => setCreating(false)}
            onCreated={(k) => {
              setCreating(false);
              setCreated(k);
              q.reload();
            }}
          />
        )}
      </Modal>
      <Modal open={!!created} title="Your new key" onClose={() => setCreated(null)} wide dismissable={false}>
        {created && <Reveal created={created} onDone={() => setCreated(null)} />}
      </Modal>
      <ConfirmDialog
        open={!!revoking}
        title={`Revoke "${revoking?.name ?? ""}"?`}
        description="It stops working at once. Any script still using it will be refused. An import that is already running finishes. This cannot be undone: make a new key if you need one."
        confirmLabel="Revoke key"
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking) return;
          await api(`/api-keys/${revoking.id}`, { method: "DELETE" });
          toast("Key revoked");
          q.reload();
        }}
      />
    </>
  );
}
