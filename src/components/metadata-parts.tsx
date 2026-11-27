import { SOURCE_LABEL, STATUS_LABEL, VERIFICATION_LABEL, type MetadataStatus, type Provenance } from "@/lib/metadata";
import { Badge, type Tone } from "./ui";

const STATUS_TONE: Record<MetadataStatus, Tone> = { not_started: "gray", in_progress: "blue", pending_review: "amber", verified: "green" };

export function MetadataStatusBadge({ status }: { status: MetadataStatus }) {
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

/** Where a saved value came from and whether anyone has verified it. A value not yet saved has no history. */
export function ProvenanceBadge({ p }: { p: Provenance | undefined }) {
  if (!p) return <Badge tone="purple">Not saved yet</Badge>;
  const tone: Tone = p.verification === "verified" ? "green" : p.verification === "rejected" ? "red" : "amber";
  return (
    <Badge tone={tone}>
      {VERIFICATION_LABEL[p.verification]} · {SOURCE_LABEL[p.source]}
    </Badge>
  );
}
