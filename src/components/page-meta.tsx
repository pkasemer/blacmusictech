"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { favorites, recents } from "@/lib/listStore";

interface Meta {
  title?: string;
  kind?: string;
  set: (m: { title?: string; kind?: string }) => void;
}
const Ctx = createContext<Meta>({ set: () => {} });

export function PageMetaProvider({ children }: { children: ReactNode }) {
  const [m, setM] = useState<{ title?: string; kind?: string }>({});
  const value = useMemo(() => ({ ...m, set: setM }), [m]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePageMeta = () => useContext(Ctx);

/**
 * Detail pages call this once the item has loaded: the name shows in the breadcrumb, and the page is remembered
 * under "Recent" in the sidebar (and can be starred as a favourite).
 */
export function usePageTitle(title: string | undefined, kind: string, remember = true) {
  const { set } = usePageMeta();
  const href = usePathname();
  useEffect(() => {
    if (!title) return;
    set({ title, kind });
    if (remember) recents.push({ href, title, kind });
    // keep a starred page's name current when it was renamed
    const fav = favorites.get().find((f) => f.href === href);
    if (fav && fav.title !== title) favorites.replace({ href, title, kind });
    return () => set({});
  }, [title, kind, href, set, remember]);
}
