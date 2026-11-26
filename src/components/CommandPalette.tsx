"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { api, qs } from "@/lib/api";
import { PAGES } from "@/lib/breadcrumbs";
import type { ArtistList, PlaylistList, ReleaseList, UserList } from "@/lib/types";
import { IServer, IImport, IKey, IAlert, IArrowDown, IArrowUp, IDashboard, IDisc, IEnter, IKeyboard, ILayers, ILogOut, IMic, IPlaylist, IPlus, IScroll, ISearch, IShield, ITrend, IUsers } from "./icons";
import { Kbd } from "./ui";

interface Item {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon: ReactNode;
  run: () => void;
}

const PAGE_ICON: Record<string, ReactNode> = {
  "/": <IDashboard />,
  "/verifications": <IShield />,
  "/playlists": <IPlaylist />,
  "/sections": <ILayers />,
  "/releases": <IDisc />,
  "/artists": <IMic />,
  "/users": <IUsers />,
  "/search-insights": <ITrend />,
  "/audit-log": <IScroll />,
  "/imports": <IImport />,
  "/api-keys": <IKey />,
  "/server": <IServer />,
};

export function CommandPalette({ open, onClose, onShortcuts, onSignOut }: { open: boolean; onClose: () => void; onShortcuts: () => void; onSignOut: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label="Command palette"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="mx-auto mb-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-xl border border-line bg-panel p-0 shadow-pop"
    >
      {open && <Palette onClose={onClose} onShortcuts={onShortcuts} onSignOut={onSignOut} />}
    </dialog>
  );
}

function Palette({ onClose, onShortcuts, onSignOut }: { onClose: () => void; onShortcuts: () => void; onSignOut: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [result, setResult] = useState<{ term: string; items: Item[] }>({ term: "", items: [] });
  const listId = useId();
  const go = (href: string) => () => {
    onClose();
    router.push(href);
  };

  const commands: Item[] = useMemo(
    () => [
      ...PAGES.map((p) => ({ id: `page-${p.href}`, group: "Go to", label: p.label, sub: p.keywords, icon: PAGE_ICON[p.href] ?? <IDashboard />, run: go(p.href) })),
      { id: "new-release", group: "Create", label: "New release", sub: "single album upload audio", icon: <IPlus />, run: go("/releases/new") },
      { id: "new-artist", group: "Create", label: "New artist", icon: <IPlus />, run: go("/artists?new=1") },
      { id: "new-playlist", group: "Create", label: "New playlist", icon: <IPlus />, run: go("/playlists?new=1") },
      { id: "new-section", group: "Create", label: "New section", icon: <IPlus />, run: go("/sections?new=1") },
      { id: "shortcuts", group: "Help", label: "Keyboard shortcuts", sub: "?", icon: <IKeyboard />, run: () => (onClose(), onShortcuts()) },
      { id: "signout", group: "Account", label: "Sign out", icon: <ILogOut />, run: () => (onClose(), onSignOut()) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const term = q.trim().toLowerCase();
  const matching = useMemo(() => {
    if (!term) return commands.filter((c) => c.group !== "Account");
    const words = term.split(/\s+/);
    return commands.filter((c) => {
      const hay = `${c.label} ${c.sub ?? ""} ${c.group}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [term, commands]);

  // people, artists, releases and playlists matching the words typed
  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const opts = { signal: ctrl.signal };
      const [u, a, r, p] = await Promise.all([
        api<UserList>(`/users${qs({ q: term, limit: 4 })}`, opts).catch(() => null),
        api<ArtistList>(`/artists${qs({ q: term, limit: 4 })}`, opts).catch(() => null),
        api<ReleaseList>(`/releases${qs({ q: term, limit: 4 })}`, opts).catch(() => null),
        api<PlaylistList>(`/playlists${qs({ q: term, limit: 4 })}`, opts).catch(() => null),
      ]);
      if (ctrl.signal.aborted) return;
      const out: Item[] = [];
      for (const x of u?.users ?? []) out.push({ id: `u-${x.id}`, group: "Users", label: x.displayName, sub: x.email, icon: <IUsers />, run: go(`/users/${x.id}`) });
      for (const x of a?.artists ?? []) out.push({ id: `a-${x.id}`, group: "Artists", label: x.name, sub: x.ownerEmail, icon: <IMic />, run: go(`/artists/${x.id}`) });
      for (const x of r?.releases ?? []) out.push({ id: `r-${x.id}`, group: "Releases", label: x.title, sub: x.artistName, icon: <IDisc />, run: go(`/releases/${x.id}`) });
      for (const x of p?.playlists ?? []) out.push({ id: `p-${x.id}`, group: "Playlists", label: x.name, sub: `${x.trackCount} tracks`, icon: <IPlaylist />, run: go(`/playlists/${x.id}`) });
      setResult({ term, items: out });
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const found = term.length >= 2 && result.term === term ? result.items : [];
  const searching = term.length >= 2 && result.term !== term;
  const items = [...matching, ...found];
  const at = Math.min(active, Math.max(0, items.length - 1));

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((at + 1) % Math.max(1, items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((at - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[at]?.run();
    }
  }

  let lastGroup = "";
  return (
    <div onKeyDown={onKey}>
      <div className="flex items-center gap-2 border-b border-line px-3.5">
        <ISearch size={16} className="text-faint" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items[at] ? `${listId}-${at}` : undefined}
          aria-label="Search pages, people, artists, releases and playlists"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          placeholder="Search or jump to…"
          className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-faint"
        />
        <Kbd>Esc</Kbd>
      </div>
      <ul id={listId} role="listbox" className="scroll-thin max-h-[52vh] overflow-y-auto p-1.5">
        {items.map((it, i) => {
          const head = it.group !== lastGroup;
          lastGroup = it.group;
          return (
            <li key={it.id} role="presentation">
              {head && <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-faint">{it.group}</div>}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === at}
                onMouseMove={() => setActive(i)}
                onClick={it.run}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${i === at ? "bg-primary-soft text-ink" : ""}`}
              >
                <span className={i === at ? "text-primary" : "text-muted"}>{it.icon}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{it.label}</span>
                {it.sub && it.group !== "Go to" && <span className="max-w-[40%] truncate text-xs text-muted">{it.sub}</span>}
                {i === at && <IEnter size={14} className="text-faint" />}
              </div>
            </li>
          );
        })}
        {items.length === 0 && !searching && (
          <li role="presentation" className="flex items-center gap-2 px-3 py-6 text-sm text-muted">
            <IAlert size={15} /> Nothing found for &ldquo;{q.trim()}&rdquo;.
          </li>
        )}
        {searching && (
          <li role="presentation" className="px-3 py-2 text-xs text-muted">
            Searching…
          </li>
        )}
      </ul>
      <div className="flex items-center gap-3 border-t border-line bg-sunken/50 px-3.5 py-2 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <IArrowUp size={12} />
          <IArrowDown size={12} /> move
        </span>
        <span className="flex items-center gap-1">
          <IEnter size={12} /> open
        </span>
      </div>
    </div>
  );
}
