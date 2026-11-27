import type { ReactNode } from "react";
import { fmtBytes, fmtNum } from "@/lib/format";
import { allowance, breakdownRows, totalBytes } from "@/lib/storage";
import type { ArtistDetail } from "@/lib/types";
import { Card, Progress } from "./ui";

/** What is stored for an artist, and, only for an artist with an account, how much of their allowance is used. */
export function StorageCard({ a, grantForm }: { a: ArtistDetail; grantForm: ReactNode }) {
  const al = allowance(a.storage, !!a.owner);
  const rows = breakdownRows(a.storage);
  return (
    <Card title="Storage">
      {al.limited ? (
        <div className="mb-4">
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span>
              {fmtBytes(a.storage.usedBytes)} of {fmtBytes(a.storage.quotaBytes)} allowance used
            </span>
            <span className={al.over ? "font-medium text-danger-ink" : "text-muted"}>{al.over ? "Over the limit" : `${fmtBytes(al.freeBytes)} left`}</span>
          </div>
          <Progress label="Storage allowance used" value={al.percent} tone={al.over ? "red" : "blue"} />
          <p className="mt-1.5 text-xs text-muted">
            The allowance counts original song uploads, drafts included. Pictures and playback copies do not count.{al.over ? " They cannot upload more until there is room." : ""}
            {!!a.storage.teamUploadBytes && <span className="block">Not counted: {fmtBytes(a.storage.teamUploadBytes)} of songs your team uploaded before this person had the artist.</span>}
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <p className="text-sm">
            <span className="text-2xl font-semibold tracking-tight">{fmtBytes(rows ? totalBytes(rows) : a.storage.usedBytes)}</span>{" "}
            <span className="text-muted">{rows ? "stored in total" : "of original song uploads, drafts included"}</span>
          </p>
          <p className="mt-1 text-xs text-muted">This is a catalog artist with no account, so there is no storage limit.{rows ? "" : " Pictures and playback copies are not in this figure."}</p>
        </div>
      )}
      {rows && (
        <table className="mb-1 w-full text-left text-sm">
          <caption className="sr-only">What is stored for this artist</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th scope="col" className="py-1.5 font-semibold">
                Stored
              </th>
              <th scope="col" className="py-1.5 pl-3 text-right font-semibold">
                Files
              </th>
              <th scope="col" className="py-1.5 pl-3 text-right font-semibold">
                Size
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <th scope="row" className="py-1.5 font-normal">
                  {r.label}
                </th>
                <td className="py-1.5 pl-3 text-right tabular-nums text-muted">{fmtNum(r.files)}</td>
                <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">{fmtBytes(r.bytes)}</td>
              </tr>
            ))}
            <tr className="border-t border-line font-semibold">
              <th scope="row" className="py-1.5">
                Total
              </th>
              <td className="py-1.5 pl-3 text-right tabular-nums">{fmtNum(rows.reduce((s, r) => s + r.files, 0))}</td>
              <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">{fmtBytes(totalBytes(rows))}</td>
            </tr>
          </tbody>
        </table>
      )}
      {al.limited && (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="mb-2 text-sm font-semibold">Change the allowance</h3>
          {grantForm}
        </div>
      )}
      {al.limited && a.recentGrants.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
          {a.recentGrants.slice(0, 6).map((g) => (
            <li key={g.id} className="flex justify-between gap-2">
              <span className="truncate text-muted">
                {g.kind}: {g.note || "–"}
              </span>
              <span className="tabular-nums">
                {g.bytes > 0 ? "+" : ""}
                {fmtBytes(g.bytes)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
