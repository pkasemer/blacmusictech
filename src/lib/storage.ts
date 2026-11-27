// Display rules for an artist's storage card.
//
// The Backend charges storage only to artists with an account: `usedBytes` is the original song uploads (drafts included)
// against `quotaBytes`. A catalog artist has no account, so no limit applies to them and their quota is simply 0.

import type { ArtistStorage, StorageFiles } from "./types";

export type Allowance =
  | { limited: false }
  | { limited: true; percent: number; over: boolean; freeBytes: number };

export function allowance(storage: Pick<ArtistStorage, "usedBytes" | "quotaBytes">, hasAccount: boolean): Allowance {
  if (!hasAccount) return { limited: false };
  const { usedBytes, quotaBytes } = storage;
  const over = usedBytes > Math.max(0, quotaBytes);
  // with nothing allowed, anything stored fills the bar: it must never read as 0% used
  const percent = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : usedBytes > 0 ? 100 : 0;
  return { limited: true, percent, over, freeBytes: Math.max(0, quotaBytes - usedBytes) };
}

export interface StorageRow {
  key: string;
  label: string;
  files: number;
  bytes: number;
}

const ROWS: [keyof NonNullable<ArtistStorage["breakdown"]>, string][] = [
  ["publishedAudio", "Songs in published releases"],
  ["unpublishedAudio", "Songs in drafts, scheduled and taken-down releases"],
  ["unfinishedUploads", "Uploads not finished yet"],
  ["playbackAudio", "Copies made for playback"],
  ["pictures", "Pictures and covers, drafts included"],
];

/** Everything stored for the artist, or null when the server does not send the breakdown. */
export function breakdownRows(storage: ArtistStorage): StorageRow[] | null {
  const b = storage.breakdown;
  if (!b) return null;
  return ROWS.map(([key, label]) => {
    const c: StorageFiles | undefined = b[key];
    return { key, label, files: c?.files ?? 0, bytes: c?.bytes ?? 0 };
  });
}

export const totalBytes = (rows: StorageRow[]) => rows.reduce((s, r) => s + r.bytes, 0);
