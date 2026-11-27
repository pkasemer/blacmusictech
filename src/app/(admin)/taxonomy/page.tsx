"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Dialogs";
import { Chips } from "@/components/import-parts";
import { useToast } from "@/components/Shell";
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, PageHeader, SearchField, Select, Table, Td, Th } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Taxonomy } from "@/lib/metadata";
import { canManage, createBody, entries, formOf, hasSubgenres, LISTS, nameMax, nameProblem, parentChoices, patchBody, rows, taxonomyError, type Entry, type ListKind } from "@/lib/taxonomy";
import { useApi } from "@/lib/useApi";

const friendly = (e: unknown) => (e instanceof ApiError ? new ApiError(e.status, e.code, taxonomyError(e.code, e.status, e.message)) : new ApiError(0, "error", "Could not save."));
const count = (n: number) => `${n} ${n === 1 ? "track" : "tracks"}`;

export default function TaxonomyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get("list");
  const list = LISTS.find((l) => l.kind === asked) ?? LISTS[0]!;
  const q = useApi<Taxonomy>("/taxonomy?usage=true");
  const toast = useToast();
  const [search, setSearch] = useState("");
  // null: closed; "new": adding
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [retiring, setRetiring] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const tax = q.data;
  const manage = !!tax && canManage(tax);
  const shown = tax ? rows(tax, list.kind, search) : [];
  const groups = list.kind === "language-groups";

  const send = (path: string, method: "POST" | "PATCH", body: unknown) => api(`/taxonomy/${path}`, { method, body });

  async function activate(e: Entry) {
    setBusy(true);
    try {
      await send(`${list.kind}/${e.id}`, "PATCH", { active: true });
      toast(`${e.label} is active again`);
    } catch (err) {
      toast(friendly(err).message, "error");
    } finally {
      setBusy(false);
      q.reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Metadata lists"
        subtitle="The choices offered when track metadata is entered. Entries are never deleted: deactivate one to stop it being chosen."
        actions={manage ? <Button variant="primary" onClick={() => setEditing("new")}>Add {list.one}</Button> : undefined}
      />
      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}
      {!tax && !q.error && <Loading />}
      {tax && (
        <>
          <Chips
            label="List"
            value={list.kind}
            onChange={(v) => (setSearch(""), router.replace(`/taxonomy?list=${v}`))}
            options={LISTS.map((l) => ({ value: l.kind, label: l.label, count: entries(tax, l.kind).length }))}
          />
          {!manage && <p className="mt-3 text-sm text-muted">These lists can be changed once the server has been updated.</p>}
          <div className="my-4">
            <SearchField aria-label="Search this list" className="max-w-xs" placeholder={`Search ${list.label.toLowerCase()}`} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {shown.length === 0 ? (
            <Empty>Nothing matches.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  {list.kind === "languages" && <Th>Language group</Th>}
                  {groups ? <Th>Languages</Th> : manage && <Th>Used on</Th>}
                  {!groups && <Th>State</Th>}
                  <Th />
                </tr>
              </thead>
              <tbody>
                {shown.map(({ entry: e, depth }) => (
                  <tr key={e.id}>
                    <Td className={depth ? "pl-10" : ""}>
                      <span className={e.active === false ? "text-muted" : "font-medium"}>{e.label}</span>
                      {depth === 1 && <span className="ml-2 text-xs text-muted">subgenre</span>}
                    </Td>
                    {list.kind === "languages" && <Td className="text-muted">{tax.languageGroups.find((g) => g.id === e.groupId)?.label ?? "–"}</Td>}
                    {groups ? <Td className="tabular-nums text-muted">{tax.languages.filter((l) => l.groupId === e.id).length}</Td> : manage && <Td className="tabular-nums text-muted">{count(e.usage ?? 0)}</Td>}
                    {!groups && (
                      <Td>
                        <Badge tone={e.active ? "green" : "gray"}>{e.active ? "Active" : "Inactive"}</Badge>
                      </Td>
                    )}
                    <Td>
                      {manage && (
                        <div className="flex justify-end gap-1.5">
                          <Button small aria-label={`Edit ${e.label}`} onClick={() => setEditing(e)}>
                            Edit
                          </Button>
                          {!groups && (
                            <Button small disabled={busy} aria-label={`${e.active ? "Deactivate" : "Activate"} ${e.label}`} onClick={() => (e.active ? setRetiring(e) : void activate(e))}>
                              {e.active ? "Deactivate" : "Activate"}
                            </Button>
                          )}
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Modal open={editing !== null} title={editing === "new" ? `Add ${list.one}` : `Edit ${list.one}`} onClose={() => setEditing(null)}>
            {editing !== null && (
              <EntryFields
                tax={tax}
                kind={list.kind}
                entry={editing === "new" ? undefined : editing}
                onClose={() => setEditing(null)}
                onSave={async (path, method, body) => {
                  await send(path, method, body);
                  toast("Saved");
                  q.reload();
                }}
              />
            )}
          </Modal>
          <ConfirmDialog
            open={retiring !== null}
            title={`Deactivate ${retiring?.label ?? ""}?`}
            description={
              <>
                It can no longer be chosen for a track. {retiring?.usage ? `Tracks that already have it keep it (${count(retiring.usage)}).` : "No track has it."} You can activate it again at any time.
                {retiring && list.kind === "genres" && hasSubgenres(tax, retiring.id) && " Its subgenres stay as they are."}
              </>
            }
            confirmLabel="Deactivate"
            onClose={() => setRetiring(null)}
            onConfirm={async () => {
              try {
                await send(`${list.kind}/${retiring!.id}`, "PATCH", { active: false });
              } catch (e) {
                throw friendly(e);
              }
              toast(`${retiring!.label} deactivated`);
              q.reload();
            }}
          />
        </>
      )}
    </>
  );
}

function EntryFields({ tax, kind, entry, onClose, onSave }: { tax: Taxonomy; kind: ListKind; entry?: Entry; onClose: () => void; onSave: (path: string, method: "POST" | "PATCH", body: unknown) => Promise<void> }) {
  const [form, setForm] = useState(() => formOf(entry));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const body = entry ? patchBody(kind, entry, form) : createBody(kind, form);
  const problem = nameProblem(kind, form.label);
  const renaming = !!entry && form.label.trim() !== entry.label;
  const parents = kind === "genres" ? parentChoices(tax, entry) : [];

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body || problem || busy) return;
        setBusy(true);
        setError("");
        try {
          await onSave(entry ? `${kind}/${entry.id}` : kind, entry ? "PATCH" : "POST", body);
          onClose();
        } catch (err) {
          setError(friendly(err).message);
          setBusy(false);
        }
      }}
    >
      <Field label="Name" htmlFor={`${id}-name`}>
        <Input id={`${id}-name`} value={form.label} maxLength={nameMax(kind)} autoComplete="off" onChange={(e) => setForm({ ...form, label: e.target.value })} autoFocus />
      </Field>
      {renaming && !!entry.usage && (
        <p className="text-sm text-muted">
          The new name also shows on tracks that already have it ({count(entry.usage)}){kind === "genres" ? ", and wherever the app shows this genre" : ""}. To mean something different, add a new entry instead.
        </p>
      )}
      {kind === "languages" && (
        <Field label="Language group" htmlFor={`${id}-group`}>
          <Select id={`${id}-group`} className="w-full" value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
            <option value="">No group</option>
            {tax.languageGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {kind === "genres" &&
        (entry && hasSubgenres(tax, entry.id) ? (
          <p className="text-sm text-muted">This genre has subgenres, so it cannot be placed under another genre.</p>
        ) : (
          <Field label="Subgenre of" htmlFor={`${id}-parent`}>
            <Select id={`${id}-parent`} className="w-full" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">None (a main genre)</option>
              {parents.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      {error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy || !!problem || !body}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
