"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { usePageTitle } from "@/components/page-meta";
import { DeleteDialog, ReasonDialog } from "@/components/Dialogs";
import { useToast } from "@/components/Shell";
import { Badge, Button, Card, ErrorBox, KV, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtBytes, fmtDate, fmtDateTime } from "@/lib/format";
import type { UserDeletionPreview, UserDetail } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const q = useApi<UserDetail>(`/users/${id}`);
  const [dlg, setDlg] = useState<"ban" | "unban" | "delete" | null>(null);
  const u = q.data;
  usePageTitle(u?.displayName, "user");
  const isAdmin = u?.role === "admin";

  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!u) return <Loading />;

  return (
    <>
      <PageHeader
        back={{ href: "/users", label: "Users" }}
        title={u.displayName}
        subtitle={u.email}
        actions={
          isAdmin ? (
            <Badge tone="purple">Administrator accounts cannot be banned or deleted here</Badge>
          ) : (
            <>
              {u.banned ? <Button onClick={() => setDlg("unban")}>Unban</Button> : <Button variant="danger" onClick={() => setDlg("ban")}>Ban user</Button>}
              <Button variant="danger" onClick={() => setDlg("delete")}>
                Delete user
              </Button>
            </>
          )
        }
      />
      {u.ban && (
        <div role="status" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <strong>Banned</strong> on {fmtDateTime(u.ban.at)}. Reason: {u.ban.reason}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Account">
          <KV
            items={[
              ["Role", u.role === "admin" ? <Badge tone="purple">Admin</Badge> : "User"],
              ["Email", <>{u.email} {u.emailVerified ? <Badge tone="green">verified</Badge> : <Badge tone="amber">not verified</Badge>}</>],
              ["Sign-in methods", Object.entries(u.signIn).filter(([, on]) => on).map(([k]) => k).join(", ") || "–"],
              ["Joined", fmtDate(u.createdAt)],
              ["Last seen", fmtDateTime(u.lastSeenAt)],
              ["Push notifications", u.pushEnabled ? "On" : "Off"],
            ]}
          />
        </Card>
        <Card title="Activity">
          <KV
            items={[
              ["Artist profile", u.artist ? <Link className="text-brand hover:underline" href={`/artists/${u.artist.id}`}>{u.artist.name}</Link> : "None"],
              ["Playlists", u.counts.playlists],
              ["Following", `${u.counts.followedArtists} artists`],
              ["Saved items", u.counts.savedItems],
            ]}
          />
        </Card>
      </div>

      <ReasonDialog
        open={dlg === "ban"}
        title={`Ban ${u.displayName}?`}
        description={
          <>
            They are signed out immediately and cannot sign in. Their public playlists are hidden{u.artist ? `, and their artist profile "${u.artist.name}" and releases are hidden too` : ""}. You can unban them later.
          </>
        }
        confirmLabel="Ban user"
        danger
        onClose={() => setDlg(null)}
        onSubmit={async (reason) => {
          await api(`/users/${u.id}/ban`, { method: "POST", body: { reason } });
          toast("User banned");
          q.reload();
        }}
      />
      <ReasonDialog
        open={dlg === "unban"}
        title={`Unban ${u.displayName}?`}
        description="They can sign in again and their content becomes visible again."
        confirmLabel="Unban"
        reasonLabel="Note"
        required={false}
        onClose={() => setDlg(null)}
        onSubmit={async (note) => {
          await api(`/users/${u.id}/unban`, { method: "POST", body: { note } });
          toast("User unbanned");
          q.reload();
        }}
      />
      <DeleteDialog<UserDeletionPreview>
        open={dlg === "delete"}
        title={`Delete ${u.email}?`}
        previewPath={`/users/${u.id}/deletion-preview`}
        describe={(p) => [
          `The account ${u.email} and ${p.sessions} sign-in session${p.sessions === 1 ? "" : "s"}`,
          p.artist ? `The artist profile "${p.artist.name}"` : "No artist profile",
          `${p.releases} release${p.releases === 1 ? "" : "s"} with ${p.tracks} track${p.tracks === 1 ? "" : "s"} and their audio files (${fmtBytes(p.storageBytes)})`,
          `${p.playlists} playlist${p.playlists === 1 ? "" : "s"}, ${p.libraryItems} saved library item${p.libraryItems === 1 ? "" : "s"} and ${p.uploads} unfinished upload${p.uploads === 1 ? "" : "s"}`,
        ]}
        confirmValue={u.email}
        confirmHint={`Type ${u.email} to confirm`}
        onClose={() => setDlg(null)}
        onDelete={async (reason) => {
          await api(`/users/${u.id}`, { method: "DELETE", body: { reason, confirmEmail: u.email } });
          toast("User deleted");
          router.replace("/users");
        }}
      />
    </>
  );
}
