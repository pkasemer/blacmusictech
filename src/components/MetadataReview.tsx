"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { SOURCE_LABEL, VERIFICATION_LABEL, itemKey, metadataError, reviewItems, supportsReview, type ReviewItem, type Taxonomy, type TrackMetadata } from "@/lib/metadata";
import { ConfirmDialog } from "./ConfirmDialog";
import { ReasonDialog } from "./Dialogs";
import { useToast } from "./Shell";
import { Badge, Button, Table, Td, Th } from "./ui";

/** Every saved value with where it came from and, for a reviewer, the means to verify or reject the ticked ones. */
export function MetadataReview({ track, tax, unsaved, onDone }: { track: TrackMetadata; tax: Taxonomy; unsaved: boolean; onDone: (m: TrackMetadata) => void }) {
  const toast = useToast();
  const items = reviewItems(track, tax);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [dialog, setDialog] = useState<"verify" | "verifyAll" | "reject" | null>(null);
  const canReview = supportsReview(track);
  const waiting = items.filter((i) => i.link.verification === "pending");
  const chosen = items.filter((i) => picked.has(itemKey(i)));

  async function review(decision: "verify" | "reject", list: ReviewItem[], note?: string) {
    try {
      const m = await api<TrackMetadata>(`/tracks/${track.trackId}/metadata/review`, {
        method: "POST",
        body: { version: track.version, decision, items: list.map((i) => ({ category: i.category, id: i.id })), ...(note ? { note } : {}) },
      });
      toast(decision === "verify" ? `Verified ${list.length} value${list.length === 1 ? "" : "s"}` : `Rejected ${list.length} value${list.length === 1 ? "" : "s"}`);
      onDone(m);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "error", "Could not record the review.");
      throw new ApiError(err.status, err.code, metadataError(err.code, err.status, err.message));
    }
  }

  if (items.length === 0) return <p className="text-sm text-muted">Nothing is saved yet.</p>;
  return (
    <>
      {canReview && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button small variant="primary" disabled={unsaved || chosen.length === 0} onClick={() => setDialog("verify")}>
            Verify selected ({chosen.length})
          </Button>
          <Button small disabled={unsaved || chosen.length === 0} onClick={() => setDialog("reject")}>
            Reject selected
          </Button>
          <Button small disabled={unsaved || waiting.length === 0} onClick={() => setDialog("verifyAll")}>
            Verify all not yet verified ({waiting.length})
          </Button>
          {unsaved && <span className="text-xs text-warning-ink">Save your changes before reviewing.</span>}
        </div>
      )}
      <Table>
        <thead>
          <tr>
            {canReview && (
              <Th className="w-10">
                <input type="checkbox" className="size-4 accent-primary" aria-label="Select every value" checked={chosen.length === items.length} onChange={(e) => setPicked(new Set(e.target.checked ? items.map(itemKey) : []))} />
              </Th>
            )}
            <Th>Category</Th>
            <Th>Value</Th>
            <Th>Source</Th>
            <Th>Verification</Th>
            <Th>Confidence</Th>
            <Th>Reviewed by</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={itemKey(i)}>
              {canReview && (
                <Td>
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    aria-label={`Select ${i.categoryLabel} ${i.name}`}
                    checked={picked.has(itemKey(i))}
                    onChange={(e) =>
                      setPicked((old) => {
                        const next = new Set(old);
                        if (e.target.checked) next.add(itemKey(i));
                        else next.delete(itemKey(i));
                        return next;
                      })
                    }
                  />
                </Td>
              )}
              <Td className="text-muted">{i.categoryLabel}</Td>
              <Td className="font-medium">{i.name}</Td>
              <Td>{SOURCE_LABEL[i.link.source] ?? i.link.source}</Td>
              <Td>
                <Badge tone={i.link.verification === "verified" ? "green" : i.link.verification === "rejected" ? "red" : "amber"}>{VERIFICATION_LABEL[i.link.verification] ?? i.link.verification}</Badge>
              </Td>
              <Td className="tabular-nums text-muted">{i.link.confidence === null ? "–" : `${Math.round(i.link.confidence * 100)}%`}</Td>
              <Td className="text-muted">{i.link.verifiedBy ? `${i.link.verifiedBy.email}, ${fmtDateTime(i.link.verifiedAt)}` : "–"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <ConfirmDialog
        open={dialog === "verify" || dialog === "verifyAll"}
        title={`Verify ${(dialog === "verifyAll" ? waiting : chosen).length} value(s) of "${track.title}"?`}
        description={`You are confirming these are correct: ${(dialog === "verifyAll" ? waiting : chosen).map((i) => `${i.categoryLabel} ${i.name}`).join(", ")}.`}
        confirmLabel="Verify"
        onClose={() => setDialog(null)}
        onConfirm={() => review("verify", dialog === "verifyAll" ? waiting : chosen)}
      />
      <ReasonDialog
        open={dialog === "reject"}
        title={`Reject ${chosen.length} value(s)?`}
        description={`They stay recorded, marked as rejected: ${chosen.map((i) => `${i.categoryLabel} ${i.name}`).join(", ")}. To change what the song shows, edit and save it.`}
        confirmLabel="Reject"
        danger
        onClose={() => setDialog(null)}
        onSubmit={(note) => review("reject", chosen, note)}
      />
    </>
  );
}
