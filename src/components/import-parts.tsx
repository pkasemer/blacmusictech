import { JOB_LABEL, type ImportTrackStatus, type JobStatus } from "@/lib/imports";
import { Badge, type Tone } from "./ui";

const JOB_TONE: Record<JobStatus, Tone> = {
  pending: "amber",
  processing: "blue",
  completed: "green",
  completed_with_errors: "amber",
  failed: "red",
  cancelled: "gray",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={JOB_TONE[status] ?? "gray"}>{JOB_LABEL[status] ?? status}</Badge>;
}

const TRACK: Record<ImportTrackStatus, [Tone, string]> = {
  waiting: ["gray", "Waiting"],
  processing: ["blue", "Processing"],
  created: ["green", "Added"],
  skippedDuplicate: ["gray", "Already there"],
  failed: ["red", "Failed"],
};

export function TrackStatusBadge({ status }: { status: ImportTrackStatus }) {
  const [tone, label] = TRACK[status] ?? ["gray", status];
  return <Badge tone={tone}>{label}</Badge>;
}
