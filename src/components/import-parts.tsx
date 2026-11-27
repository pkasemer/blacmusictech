import { JOB_LABEL, type ImportTrackStatus, type JobStatus } from "@/lib/imports";
import { Badge, cx, type Tone } from "./ui";

/** A row of one-of-many filter buttons with counts. */
export function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; count: number | string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex h-8 items-center gap-1.5 rounded-control border px-3 text-sm font-medium",
            value === o.value ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-panel text-muted hover:bg-sunken hover:text-ink",
          )}
        >
          {o.label}
          <span className="tabular-nums text-xs opacity-80">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

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
