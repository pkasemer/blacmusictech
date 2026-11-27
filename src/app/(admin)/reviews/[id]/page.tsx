"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Modal, ReasonDialog } from "@/components/Dialogs";
import { usePageTitle } from "@/components/page-meta";
import { useToast } from "@/components/Shell";
import { Badge, Button, Card, ErrorBox, KV, Loading, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtDuration } from "@/lib/format";
import { formatStamp, type Lyrics } from "@/lib/lyrics";
import { creditText, decisionError, fieldText, isProfile, kindLabel, outdated, REVIEWS_CHANGED, STATUS_LABEL, STATUS_TONE, waited, type ChangeItem, type Credit, type ReviewDetail, type ReviewTrack } from "@/lib/reviews";
import { useApi } from "@/lib/useApi";

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<ReviewDetail>(`/reviews/${id}`);
  // the answer to a decision is newer than what was read
  const [decided, setDecided] = useState<ReviewDetail>();
  const r = decided?.id === id ? decided : q.data?.id === id ? q.data : undefined;
  usePageTitle(r ? `Review: ${r.title}` : undefined, "release");

  if (q.error && !r) return <ErrorBox error={q.error.code === "not_available" ? "The server cannot review this yet. It needs the latest Backend update." : q.error} onRetry={q.reload} />;
  if (!r) return <Loading />;
  return (
    <Review
      r={r}
      onDecided={setDecided}
      onReload={() => {
        setDecided(undefined);
        q.reload();
      }}
    />
  );
}

function Review({ r, onDecided, onReload }: { r: ReviewDetail; onDecided: (d: ReviewDetail) => void; onReload: () => void }) {
  const toast = useToast();
  const [dlg, setDlg] = useState<"approve" | "reject" | null>(null);
  const tracks = r.tracks ?? [];
  const credits = r.credits ?? [];
  const changes = r.changeItems ?? [];
  const update = r.kind === "update";
  const profile = isProfile(r);
  const unapproved = !profile && r.artistProfile?.approved === false ? r.artistProfile : null;

  /** Sends the decision for exactly what is on screen. */
  async function decide(what: "approve" | "reject", reason?: string) {
    try {
      const d = await api<ReviewDetail>(`/reviews/${r.id}/${what}`, { method: "POST", body: { revision: r.revision, ...(reason ? { reason } : {}) } });
      toast(what === "approve" ? "Approved" : "Rejected. The artist is told why.");
      onDecided(d);
      window.dispatchEvent(new Event(REVIEWS_CHANGED));
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      const message = decisionError(e.code, e.message);
      if (!outdated(e.code)) throw new ApiError(e.status, e.code, message);
      toast(message, "error");
      window.dispatchEvent(new Event(REVIEWS_CHANGED));
      onReload();
    }
  }

  return (
    <>
      <PageHeader
        title={r.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/artists/${r.artist.id}`} className="text-primary hover:underline">
              {r.artist.name}
            </Link>
            <Badge tone={r.kind === "new" ? "blue" : "gray"}>{kindLabel(r)}</Badge>
            <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
            <span className="text-xs">
              Sent {fmtDateTime(r.submittedAt)}
              {r.status === "pending" ? ` · waiting ${waited(r.submittedAt)}` : ""}
            </span>
          </span>
        }
        actions={
          r.status === "pending" ? (
            <>
              <Button onClick={() => setDlg("reject")} className="text-danger-ink">
                Reject
              </Button>
              <Button variant="primary" onClick={() => setDlg("approve")} disabled={!!unapproved}>
                Approve
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="space-y-4">
        {r.status !== "pending" && (
          <div role="status" className="rounded-control border border-line bg-panel px-4 py-3 text-sm">
            <strong>{STATUS_LABEL[r.status]}</strong>
            {r.decidedAt ? ` on ${fmtDateTime(r.decidedAt)}` : ""}
            {r.decidedBy ? ` by ${r.decidedBy.email}` : ""}.{r.reason ? ` Reason given to the artist: ${r.reason}` : ""}
          </div>
        )}
        {unapproved && r.status === "pending" && (
          <div role="status" className="rounded-control border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-ink">
            This artist&rsquo;s profile is not approved yet, so this release cannot be approved.{" "}
            {unapproved.reviewId ? (
              <Link href={`/reviews/${unapproved.reviewId}`} className="font-semibold underline">
                Review the profile first
              </Link>
            ) : (
              "It was rejected: the artist has to send a change."
            )}
          </div>
        )}
        {update && r.status === "pending" && <p className="text-sm text-muted">Listeners keep seeing the current version until you approve. If you reject, these changes are never shown to them.</p>}

        {update && changes.length > 0 && (
          <Card title={`What changes (${changes.length})`}>
            <ul className="divide-y divide-line">
              {changes.map((c, i) => (
                <li key={i} className="py-3 first:pt-0 last:pb-0">
                  <h3 className="mb-2 text-sm font-semibold">{c.label}</h3>
                  <Change item={c} tracks={tracks} />
                </li>
              ))}
            </ul>
          </Card>
        )}

        {profile ? (
          <ProfileBody r={r} />
        ) : (
          <>
        <Card title={update ? "The release now" : "Release"}>
          <div className="flex flex-wrap items-start gap-5">
            <Cover url={r.coverUrl} />
            <div className="min-w-0 flex-1 basis-64">
              <KV
                items={[
                  ["Title", r.title],
                  ["Type", r.type],
                  ["Genre", r.release.genre || "None"],
                  ["Release date", r.release.releaseDate ? fmtDate(r.release.releaseDate) : "Not set"],
                  ...(r.publishAt ? [["Asked to go live", fmtDateTime(r.publishAt)] as [string, string]] : []),
                  ["Description", <span key="d" className="whitespace-pre-wrap">{r.release.description || "None"}</span>],
                ]}
              />
              <Link href={`/releases/${r.releaseId}`} className="mt-3 inline-block text-sm text-primary hover:underline">
                Open the release page
              </Link>
            </div>
          </div>
        </Card>

        <Card title={`Tracks (${tracks.length})`}>
          {tracks.length === 0 ? (
            <p className="text-sm text-muted">No tracks.</p>
          ) : (
            <ol className="divide-y divide-line">
              {tracks.map((t) => (
                <li key={t.trackId} className="py-3 first:pt-0 last:pb-0">
                  <Track t={t} />
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-xs text-muted">Audio links last an hour. If one stops playing, reload the page.</p>
        </Card>

        <Card title="Credits and featured artists">
          <CreditList credits={credits} tracks={tracks} />
        </Card>
          </>
        )}
      </div>

      <Modal open={dlg === "approve"} title={`Approve "${r.title}"?`} onClose={() => setDlg(null)}>
        {dlg === "approve" && (
          <Approve
            text={profile ? (update ? "The new profile details replace what listeners see now. The artist is told." : "The artist's name, bio and picture become visible to listeners. The artist is told.") : update ? "The changes replace what listeners see now. The artist is told." : r.publishAt ? `The artist asked for ${fmtDateTime(r.publishAt)}. It goes live then, or right away if that time has passed. The artist is told.` : "It goes live to listeners right away. The artist is told."}
            onClose={() => setDlg(null)}
            onApprove={() => decide("approve")}
          />
        )}
      </Modal>
      <ReasonDialog
        open={dlg === "reject"}
        title={`Reject "${r.title}"?`}
        description={update ? "The changes are not shown to listeners. The artist sees your reason." : profile ? "The profile stays hidden. The artist sees your reason and can send a change." : "It stays hidden. The artist sees your reason, can fix it and send it again."}
        confirmLabel="Reject"
        reasonLabel="Reason (the artist reads this)"
        danger
        onClose={() => setDlg(null)}
        onSubmit={(reason) => decide("reject", reason)}
      />
    </>
  );
}

function Approve({ text, onClose, onApprove }: { text: string; onClose: () => void; onApprove: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{text}</p>
      {error && <ErrorBox error={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onApprove();
              onClose();
            } catch (e) {
              setError(e instanceof ApiError ? e.message : "Something went wrong.");
              setBusy(false);
            }
          }}
        >
          {busy ? "Working…" : "Approve"}
        </Button>
      </div>
    </div>
  );
}

function Photo({ url }: { url?: string }) {
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" aria-label="Open the picture at full size">
      {/* eslint-disable-next-line @next/next/no-img-element -- from the API's own media host */}
      <img src={url} alt="Artist" className="size-32 rounded-full border border-line object-cover" />
    </a>
  ) : (
    <span className="flex size-32 items-center justify-center rounded-full border border-line bg-sunken text-xs text-muted">No picture</span>
  );
}

/** A new profile is shown whole; changes are compared above it. */
function ProfileBody({ r }: { r: ReviewDetail }) {
  const shown = r.approved;
  const waiting = r.releaseReviewIds ?? [];
  return (
    <>
      <Card title={r.kind === "update" ? "The profile now" : "Profile"}>
        <div className="flex flex-wrap items-start gap-5">
          <Photo url={shown?.imageUrl} />
          <div className="min-w-0 flex-1 basis-64">
            <KV
              items={[
                ["Name", shown?.name || "None"],
                ["Bio", <span key="b" className="whitespace-pre-wrap">{shown?.bio || "None"}</span>],
                ["Artist since", r.artistCreatedAt ? fmtDate(r.artistCreatedAt) : "–"],
              ]}
            />
            <Link href={`/artists/${r.artist.id}`} className="mt-3 inline-block text-sm text-primary hover:underline">
              Open the artist page
            </Link>
          </div>
        </div>
      </Card>
      {waiting.length > 0 && (
        <Card title="Releases waiting from this artist">
          <ul className="space-y-1 text-sm">
            {waiting.map((rid, i) => (
              <li key={rid}>
                <Link href={`/reviews/${rid}`} className="text-primary hover:underline">
                  Open waiting release {i + 1}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Cover({ url }: { url?: string }) {
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" aria-label="Open the cover at full size">
      {/* eslint-disable-next-line @next/next/no-img-element -- from the API's own media host */}
      <img src={url} alt="Cover" className="size-40 rounded-card border border-line object-cover" />
    </a>
  ) : (
    <span className="flex size-40 items-center justify-center rounded-card border border-line bg-sunken text-xs text-muted">No cover</span>
  );
}

function Track({ t }: { t: ReviewTrack }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-5 text-sm tabular-nums text-muted">{t.trackNumber || ""}</span>
        <span className="min-w-0 break-words text-sm font-semibold">{t.title}</span>
        {t.isNew && <Badge tone="blue">New song</Badge>}
        {t.explicit && <Badge>Explicit</Badge>}
        <span className="text-xs text-muted">
          {fmtDuration(t.durationMs)}
          {t.genre ? ` · ${t.genre}` : ""}
          {t.featuredArtists?.length ? ` · ft. ${t.featuredArtists.join(", ")}` : ""}
        </span>
      </div>
      {t.audioUrl ? (
        <audio
          controls
          preload="none"
          src={t.audioUrl}
          aria-label={`Listen to ${t.title}`}
          className="h-9 w-full max-w-xl"
          // one song at a time
          onPlay={(e) => document.querySelectorAll("audio").forEach((a) => a !== e.currentTarget && a.pause())}
        />
      ) : (
        <p className="text-xs text-danger-ink">No audio to play yet.</p>
      )}
      {t.lyrics ? (
        <details>
          <summary className="cursor-pointer text-sm text-primary">Lyrics</summary>
          <LyricsText lyrics={t.lyrics} />
        </details>
      ) : (
        <p className="text-xs text-muted">No lyrics.</p>
      )}
    </div>
  );
}

function LyricsText({ lyrics }: { lyrics: Lyrics | null | undefined }) {
  if (!lyrics) return <p className="text-sm text-muted">None</p>;
  if (!lyrics.synced) return <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm">{lyrics.text}</p>;
  return (
    <ol className="mt-2 max-h-72 space-y-1 overflow-y-auto">
      {lyrics.lines.map((l, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="w-16 shrink-0 font-mono text-xs leading-5 text-muted">{formatStamp(l.timeMs).slice(1, -1)}</span>
          <span className="min-w-0 break-words">
            {l.text || <span className="text-muted">♪ Music break</span>}
            {l.translation && <span className="block text-muted">{l.translation}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function CreditList({ credits, tracks }: { credits: Credit[]; tracks: ReviewTrack[] }) {
  if (!credits.length) return <p className="text-sm text-muted">No credits.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {credits.map((c, i) => (
        <li key={i} className="break-words">
          {creditText(c, tracks)}
        </li>
      ))}
    </ul>
  );
}

function Change({ item, tracks }: { item: ChangeItem; tracks: ReviewTrack[] }) {
  if (item.kind === "newTrack") {
    const t = item.proposed as ReviewTrack;
    return <Track t={tracks.find((x) => x.trackId === (t?.trackId ?? item.trackId)) ?? t} />;
  }
  const show = (value: unknown) => {
    if (item.kind === "lyrics") return <LyricsText lyrics={value as Lyrics | null} />;
    if (item.kind === "credits") return <CreditList credits={(value as Credit[] | null) ?? []} tracks={tracks} />;
    if (item.field === "cover") return <Cover url={(value as string) || undefined} />;
    if (item.field === "photo") return <Photo url={(value as string) || undefined} />;
    return <p className="whitespace-pre-wrap break-words text-sm">{fieldText(item.field, value)}</p>;
  };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="min-w-0 rounded-control border border-line bg-sunken/40 p-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Listeners see now</p>
        {show(item.approved)}
      </div>
      <div className="min-w-0 rounded-control border border-primary/40 bg-primary-soft/40 p-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary-ink">Proposed</p>
        {show(item.proposed)}
      </div>
    </div>
  );
}
