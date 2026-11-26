"use client";

import { useSyncExternalStore } from "react";

export interface SavedItem {
  href: string;
  title: string;
  kind: string;
}

/** Adds an item to the front (moving it up when it is already there) and keeps at most `max`. */
export function pushRecent(list: SavedItem[], item: SavedItem, max: number): SavedItem[] {
  return [item, ...list.filter((x) => x.href !== item.href)].slice(0, max);
}

/** Adds the item when absent, removes it when present. */
export function toggleItem(list: SavedItem[], item: SavedItem, max: number): SavedItem[] {
  return list.some((x) => x.href === item.href) ? list.filter((x) => x.href !== item.href) : [item, ...list].slice(0, max);
}

/** Reads a stored list defensively: anything unexpected becomes an empty list. */
export function parseList(raw: string | null): SavedItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is SavedItem => !!x && typeof x.href === "string" && x.href.startsWith("/") && typeof x.title === "string" && typeof x.kind === "string")
      .map((x) => ({ href: x.href, title: x.title.slice(0, 80), kind: x.kind.slice(0, 20) }));
  } catch {
    return [];
  }
}

/** A tiny browser-side list (per browser, kept in localStorage) that components can subscribe to. */
export function createListStore(key: string, max: number) {
  let cache: SavedItem[] | null = null;
  const subs = new Set<() => void>();
  const empty: SavedItem[] = [];

  const read = (): SavedItem[] => {
    if (cache) return cache;
    try {
      cache = parseList(window.localStorage.getItem(key));
    } catch {
      cache = [];
    }
    return cache;
  };
  const write = (next: SavedItem[]) => {
    cache = next;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* storage may be unavailable (private mode): keep it in memory */
    }
    subs.forEach((f) => f());
  };

  return {
    use(): SavedItem[] {
      return useSyncExternalStore(
        (f) => {
          subs.add(f);
          return () => subs.delete(f);
        },
        read,
        () => empty,
      );
    },
    get: (): SavedItem[] => read(),
    push: (item: SavedItem) => write(pushRecent(read(), item, max)),
    /** swaps an item for a newer copy of itself without changing its place */
    replace: (item: SavedItem) => write(read().map((x) => (x.href === item.href ? item : x))),
    toggle: (item: SavedItem) => write(toggleItem(read(), item, max)),
    remove: (href: string) => write(read().filter((x) => x.href !== href)),
  };
}

export const recents = createListStore("blac-admin-recent", 6);
export const favorites = createListStore("blac-admin-favorites", 8);
