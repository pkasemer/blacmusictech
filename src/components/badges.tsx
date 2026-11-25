import type { Verification, Visibility } from "@/lib/types";
import { Badge } from "./ui";

export function VerificationBadge({ v }: { v: Verification }) {
  const map = { verified: ["green", "Verified"], pending: ["amber", "Pending"], rejected: ["red", "Rejected"], unverified: ["gray", "Not verified"] } as const;
  const [tone, label] = map[v];
  return <Badge tone={tone}>{label}</Badge>;
}

export function VisibilityBadge({ v, takenDown }: { v: Visibility; takenDown?: boolean }) {
  if (takenDown) return <Badge tone="red">Taken down</Badge>;
  const map = { public: ["green", "Public"], draft: ["gray", "Draft"], scheduled: ["blue", "Scheduled"] } as const;
  const [tone, label] = map[v];
  return <Badge tone={tone}>{label}</Badge>;
}
