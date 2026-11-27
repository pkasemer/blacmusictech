"use client";

import { useState } from "react";
import { qs } from "@/lib/api";
import type { ArtistList } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";
import { IClose } from "./icons";
import { SearchField } from "./ui";

export interface PickedArtist {
  id: string;
  name: string;
}

/** Narrows a list to one artist: search by name, pick, clear. */
export function ArtistFilter({ value, onChange }: { value: PickedArtist | null; onChange: (a: PickedArtist | null) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const term = useDebounced(q.trim());
  const found = useApi<ArtistList>(term.length >= 2 ? `/artists${qs({ q: term, limit: 8 })}` : null);

  if (value)
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-control border border-primary/40 bg-primary-soft pl-2.5 pr-1 text-sm">
        Artist: <span className="max-w-40 truncate font-medium">{value.name}</span>
        <button type="button" aria-label="Clear the artist filter" onClick={() => (onChange(null), setQ(""))} className="rounded p-1 hover:bg-primary/10">
          <IClose size={13} />
        </button>
      </span>
    );
  return (
    <div
      className="relative w-56"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <SearchField aria-label="Filter by artist" placeholder="Filter by artist…" value={q} onFocus={() => setOpen(true)} onChange={(e) => (setQ(e.target.value), setOpen(true))} />
      {open && term.length >= 2 && found.data && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-control border border-line bg-panel py-1 shadow-pop">
          {found.data.artists.length === 0 && <li className="px-3 py-2 text-sm text-muted">No artist matches.</li>}
          {found.data.artists.map((a) => (
            <li key={a.id}>
              <button type="button" className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-sunken" onClick={() => (onChange({ id: a.id, name: a.name }), setOpen(false))}>
                {a.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
