"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useId, useState } from "react";
import { VerificationBadge } from "@/components/badges";
import { usePageTitle } from "@/components/page-meta";
import { DeleteDialog, ReasonDialog } from "@/components/Dialogs";
import { useToast } from "@/components/Shell";
import { Avatar, Badge, Button, Card, ErrorBox, Field, Input, KV, Loading, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { api, ApiError, qs } from "@/lib/api";
import { fmtBytes, fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import type { ArtistDeletionPreview, ArtistDetail, ReleaseList } from "@/lib/types";
import { grantDecision, verificationError, type Decision } from "@/lib/verification";
import { IAlert, IShield } from "@/components/icons";
import { useApi } from "@/lib/useApi";
import { VisibilityBadge } from "@/components/badges";
import { BulkPublishDialog, SelectBox, SelectionBar, useSelection } from "@/components/BulkPublish";
import { CoverUpload } from "@/components/CoverUpload";
import { CombineDialog } from "@/components/CombineReleases";
import { combinable } from "@/lib/combine";
import { StorageCard } from "@/components/StorageCard";
import { RemoveOwnerDialog, TransferDialog } from "@/components/Ownership";
import { whyNotSelectable } from "@/lib/bulk";

type Dlg = "ban" | "unban" | "delete" | "verify" | "reject" | "revoke" | "transfer" | "removeOwner" | null;

function EditForm({ a, onSaved }: { a: ArtistDetail; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(a.name);
  const [bio, setBio] = useState(a.bio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idN = useId();
  const idB = useId();
  const dirty = name.trim() !== a.name || bio !== a.bio;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api(`/artists/${a.id}`, { method: "PATCH", body: { name: name.trim(), bio } });
          toast("Profile saved");
          onSaved();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Name" htmlFor={idN} hint="1–100 characters">
        <Input id={idN} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Bio" htmlFor={idB} hint={`${bio.length}/1000`}>
        <Textarea id={idB} rows={4} maxLength={1000} value={bio} onChange={(e) => setBio(e.target.value)} />
      </Field>
      {error && <ErrorBox error={error} />}
      <Button type="submit" variant="primary" disabled={!dirty || busy || name.trim().length < 1}>
        {busy ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

function GrantForm({ a, onDone }: { a: ArtistDetail; onDone: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState("promo");
  const [mb, setMb] = useState("1024");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = Number(mb);
  const valid = Number.isFinite(n) && n !== 0 && note.trim().length >= 3;
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        setError("");
        try {
          await api(`/artists/${a.id}/storage-grants`, { method: "POST", body: { kind, bytes: Math.round(n * 1024 * 1024), note: note.trim() } });
          toast("Storage updated");
          setNote("");
          onDone();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not add storage.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="promo">Promo</option>
          <option value="purchase">Purchase</option>
          <option value="adjustment">Adjustment (use a negative number to remove)</option>
        </Select>
        <Input aria-label="Megabytes" className="w-32" type="number" value={mb} onChange={(e) => setMb(e.target.value)} />
        <span className="self-center text-sm text-muted">MB</span>
      </div>
      <Input aria-label="Note" placeholder="Why (saved with the grant)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <ErrorBox error={error} />}
      <Button type="submit" disabled={!valid || busy}>
        Apply
      </Button>
    </form>
  );
}

export default function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const q = useApi<ArtistDetail>(`/artists/${id}`);
  const releases = useApi<ReleaseList>(`/releases${qs({ artistId: id, limit: 100 })}`);
  const [dlg, setDlg] = useState<Dlg>(null);
  const selection = useSelection();
  const [publishing, setPublishing] = useState(false);
  const [combining, setCombining] = useState(false);
  const a = q.data;
  usePageTitle(a?.name, "artist");

  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!a) return <Loading />;
  const banned = !!a.ban;
  const v = a.verification;
  const grant = grantDecision(v.state); // null once verified
  const artistId = a.id;
  // nothing of a banned artist can be published
  const pickable = banned ? [] : (releases.data?.releases ?? []).filter((r) => !whyNotSelectable(r));
  const pickedAll = pickable.length > 0 && pickable.every((r) => selection.has(r.id));

  async function decide(decision: Decision, note: string, done: string) {
    try {
      await api(`/artists/${artistId}/verification`, { method: "POST", body: { decision, note } });
    } catch (e) {
      if (e instanceof ApiError) throw new ApiError(e.status, e.code, verificationError(decision, e.code, e.message));
      throw e;
    }
    toast(done);
    q.reload();
  }

  return (
    <>
      <PageHeader
        back={{ href: "/artists", label: "Artists" }}
        title={a.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <VerificationBadge v={v.state} />
            {banned && <Badge tone="red">Banned</Badge>}
            {a.flagged && <Badge tone="amber">Flagged: name matches a verified artist</Badge>}
          </span>
        }
        actions={
          <>
            <Link href={`/releases/new?artistId=${a.id}`}>
              <Button variant="primary">New release</Button>
            </Link>
            {grant ? (
              <Button disabled={banned} title={banned ? "Unban the artist before verifying" : undefined} onClick={() => setDlg("verify")}>
                <IShield size={14} /> Mark as verified
              </Button>
            ) : (
              <Button onClick={() => setDlg("revoke")}>Revoke verification</Button>
            )}
            {banned ? <Button onClick={() => setDlg("unban")}>Unban</Button> : <Button variant="danger" onClick={() => setDlg("ban")}>Ban artist</Button>}
            <Button variant="danger" onClick={() => setDlg("delete")}>
              Delete artist
            </Button>
          </>
        }
      />
      {a.ban && (
        <div role="status" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <strong>Banned</strong> on {fmtDateTime(a.ban.at)}. Reason: {a.ban.reason}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profile">
          <div className="mb-5 border-b border-line pb-5">
            {a.owner ? (
              <div className="flex flex-wrap items-center gap-4">
                {a.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the image comes from the API's own media host
                  <img src={a.imageUrl} alt={`${a.name}`} className="size-24 rounded-full border border-line object-cover" />
                ) : (
                  <Avatar name={a.name} size={96} />
                )}
                <p className="min-w-0 flex-1 basis-40 text-sm text-muted">This artist has an account, so the picture is that person&rsquo;s profile picture. Only they can change it, in the app.</p>
              </div>
            ) : (
              <CoverUpload
                key={a.imageUrl ?? "none"}
                target={`/artists/${a.id}`}
                field="imageId"
                purpose="avatar"
                label="Picture"
                round
                coverUrl={a.imageUrl}
                hint="This is the cover on the artist’s profile in the app. A square picture works best (JPEG, PNG or WebP, up to 10 MB)."
                onChanged={q.reload}
              />
            )}
          </div>
          <EditForm key={`${a.name}|${a.bio}`} a={a} onSaved={q.reload} />
        </Card>

        <div className="space-y-4">
          <Card title="Verification">
            <KV
              items={[
                ["Status", <VerificationBadge key="v" v={v.state} />],
                ["Artist's message", v.message || "–"],
                ["Requested", fmtDateTime(v.requestedAt)],
                ["Last note", v.note || "–"],
              ]}
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {grant && (
                <Button variant="primary" disabled={banned} onClick={() => setDlg("verify")}>
                  <IShield size={14} /> {grant === "approve" ? "Approve request" : "Mark as verified"}
                </Button>
              )}
              {v.state === "pending" && (
                <Button variant="danger" onClick={() => setDlg("reject")}>
                  Reject request
                </Button>
              )}
              {v.state === "verified" && (
                <Button variant="danger" onClick={() => setDlg("revoke")}>
                  Revoke verification
                </Button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {v.state === "verified" ? "This artist shows the verified badge in the app." : banned ? "A banned artist cannot be verified." : "You can verify an artist even if they never asked."}
            </p>
          </Card>
          <Card title="Account and numbers">
            <KV
              items={[
                ["Owner", a.owner ? <Link key="o" className="text-brand hover:underline" href={`/users/${a.owner.id}`}>{a.owner.email}</Link> : "Catalog artist (no account)"],
                ["Followers", fmtNum(a.counts.followers)],
                ["Releases", `${fmtNum(a.counts.releases)} (${fmtNum(a.counts.publicReleases)} public, ${fmtNum(a.counts.tracks)} tracks)`],
                ["Plays", fmtNum(a.counts.plays)],
                ["Created", fmtDate(a.createdAt)],
              ]}
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {a.owner ? (
                <Button variant="danger" onClick={() => setDlg("removeOwner")}>
                  Remove from user
                </Button>
              ) : (
                <Button disabled={banned} onClick={() => setDlg("transfer")}>
                  Transfer to a user
                </Button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {a.owner ? "This person manages the artist in the app." : banned ? "A banned artist cannot be transferred." : "When the artist signs up in the app, give them this profile."}
            </p>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <StorageCard a={a} grantForm={<GrantForm a={a} onDone={q.reload} />} />
        <Card
          title="Releases"
          className="lg:order-first lg:col-span-2"
          actions={
            !banned && (releases.data?.releases.filter(combinable).length ?? 0) >= 2 ? (
              <Button small onClick={() => setCombining(true)}>
                Make album or EP
              </Button>
            ) : undefined
          }
        >
          {releases.error ? (
            <ErrorBox error={releases.error} onRetry={releases.reload} />
          ) : !releases.data ? (
            <Loading />
          ) : releases.data.releases.length === 0 ? (
            <p className="text-sm text-muted">No releases.</p>
          ) : (
            <>
            <SelectionBar count={selection.items.length} hidden={selection.items.filter((s) => !releases.data!.releases.some((r) => r.id === s.id)).length} onPublish={() => setPublishing(true)} onClear={selection.clear} />
            <Table>
              <thead>
                <tr>
                  <Th className="w-10">
                    <SelectBox
                      label={pickable.length === 0 ? "Nothing here can be published" : "Select every release that can be published"}
                      disabled={pickable.length === 0}
                      checked={pickedAll}
                      mixed={selection.items.length > 0}
                      onChange={(on) => selection.set(pickable, on)}
                    />
                  </Th>
                  <Th>Title</Th>
                  <Th>State</Th>
                </tr>
              </thead>
              <tbody>
                {releases.data.releases.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <SelectBox
                        label={banned ? "This artist is banned" : (whyNotSelectable(r) ?? `Select ${r.title}`)}
                        disabled={banned || !!whyNotSelectable(r)}
                        checked={selection.has(r.id)}
                        onChange={(on) => selection.set([r], on)}
                      />
                    </Td>
                    <Td>
                      <Link href={`/releases/${r.id}`} className="font-medium hover:underline">
                        {r.title}
                      </Link>
                      <div className="text-xs text-muted">
                        {r.type} · {r.trackCount} track{r.trackCount === 1 ? "" : "s"}
                      </div>
                    </Td>
                    <Td>
                      <VisibilityBadge v={r.visibility} takenDown={r.takenDown} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            </>
          )}
        </Card>
      </div>

      <TransferDialog
        open={dlg === "transfer"}
        a={a}
        onClose={() => setDlg(null)}
        onDone={(email) => {
          toast(`Artist transferred to ${email}`);
          q.reload();
        }}
      />
      <RemoveOwnerDialog
        open={dlg === "removeOwner"}
        a={a}
        onClose={() => setDlg(null)}
        onDone={() => {
          toast("Artist removed from the user");
          q.reload();
        }}
      />
      <CombineDialog
        open={combining}
        artistName={a.name}
        releases={releases.data?.releases ?? []}
        onClose={() => setCombining(false)}
        onDone={(releaseId) => {
          toast("Releases combined");
          router.push(`/releases/${releaseId}`);
        }}
      />
      <BulkPublishDialog
        open={publishing}
        items={selection.items}
        onClose={() => setPublishing(false)}
        onFinished={(ids) => {
          selection.remove(ids);
          releases.reload();
          q.reload();
        }}
      />
      <ReasonDialog
        open={dlg === "ban"}
        title={`Ban ${a.name}?`}
        description="The profile and all public releases are hidden from listeners. You can unban later."
        confirmLabel="Ban artist"
        danger
        onClose={() => setDlg(null)}
        onSubmit={async (reason) => {
          await api(`/artists/${a.id}/ban`, { method: "POST", body: { reason } });
          toast("Artist banned");
          q.reload();
        }}
      />
      <ReasonDialog
        open={dlg === "unban"}
        title={`Unban ${a.name}?`}
        description="The profile and the releases hidden by the ban become visible again."
        confirmLabel="Unban"
        reasonLabel="Note"
        required={false}
        onClose={() => setDlg(null)}
        onSubmit={async (note) => {
          await api(`/artists/${a.id}/unban`, { method: "POST", body: { note } });
          toast("Artist unbanned");
          q.reload();
        }}
      />
      <ReasonDialog
        open={dlg === "verify"}
        title={`Verify ${a.name}?`}
        description={
          <div className="space-y-2">
            <p>The artist gets the verified badge in the app. Only verify someone whose identity you have checked.</p>
            {a.flagged && (
              <p className="flex items-start gap-2 rounded-control border border-warning/40 bg-warning/10 p-2.5 text-warning-ink">
                <IAlert size={15} className="mt-0.5 shrink-0" />
                <span>Another verified artist already has this name. Make sure this is the real one and not an impersonator.</span>
              </p>
            )}
          </div>
        }
        confirmLabel={grant === "approve" ? "Approve and verify" : "Mark as verified"}
        reasonLabel="Note (optional): how you checked who they are"
        required={false}
        onClose={() => setDlg(null)}
        onSubmit={async (note) => {
          await decide(grant ?? "verify", note, "Artist verified");
        }}
      />
      <ReasonDialog
        open={dlg === "reject"}
        title={`Reject verification for ${a.name}?`}
        description="The artist sees your reason, so write it for them."
        confirmLabel="Reject"
        reasonLabel="Reason shown to the artist"
        danger
        onClose={() => setDlg(null)}
        onSubmit={async (note) => {
          await decide("reject", note, "Verification rejected");
        }}
      />
      <ReasonDialog
        open={dlg === "revoke"}
        title={`Revoke verification for ${a.name}?`}
        description="The verified badge is removed from the app. You can verify the artist again later."
        confirmLabel="Revoke"
        danger
        onClose={() => setDlg(null)}
        onSubmit={async (note) => {
          await decide("revoke", note, "Verification revoked");
        }}
      />
      <DeleteDialog<ArtistDeletionPreview>
        open={dlg === "delete"}
        title={`Delete artist ${a.name}?`}
        previewPath={`/artists/${a.id}/deletion-preview`}
        describe={(p) => [
          `The artist profile "${a.name}" and ${fmtNum(p.followers)} follower link${p.followers === 1 ? "" : "s"}`,
          `${p.releases} release${p.releases === 1 ? "" : "s"} with ${p.tracks} track${p.tracks === 1 ? "" : "s"}`,
          `All their audio files (${fmtBytes(p.storageBytes)} freed), ${p.uploads} unfinished upload${p.uploads === 1 ? "" : "s"} and ${p.storageGrants} storage grant${p.storageGrants === 1 ? "" : "s"}`,
          a.owner ? `The owner's account (${a.owner.email}) is kept` : "No account is attached to this profile",
        ]}
        confirmValue={a.name}
        confirmHint={`Type ${a.name} to confirm`}
        onClose={() => setDlg(null)}
        onDelete={async (reason) => {
          await api(`/artists/${a.id}`, { method: "DELETE", body: { reason, confirmName: a.name } });
          toast("Artist deleted");
          router.replace("/artists");
        }}
      />
    </>
  );
}
