"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setCsrf, setSignedOutHandler } from "@/lib/api";
import { Button } from "./ui";

interface SessionInfo {
  user: { id: string; email: string; displayName: string };
}
const SessionCtx = createContext<SessionInfo | null>(null);
export const useSession = () => useContext(SessionCtx);

interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error";
}
const ToastCtx = createContext<(text: string, kind?: "ok" | "error") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/verifications", label: "Verifications" },
  { href: "/artists", label: "Artists" },
  { href: "/releases", label: "Releases" },
  { href: "/users", label: "Users" },
  { href: "/playlists", label: "Playlists" },
  { href: "/audit-log", label: "Audit log" },
];

export function Shell({ user, csrf, children }: { user: SessionInfo["user"]; csrf: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menu = menuFor === pathname; // closes by itself when the page changes

  // Set synchronously so the very first child request already carries the token.
  setCsrf(csrf);

  useEffect(() => {
    setSignedOutHandler(() => router.replace("/login"));
  }, [router]);

  // Touch the session now and then so the idle timeout only counts real inactivity.
  useEffect(() => {
    const t = setInterval(() => {
      api("/api/auth/session").catch(() => {});
    }, 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  const toast = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 8000 : 4000);
  }, []);

  const session = useMemo(() => ({ user }), [user]);

  async function signOut() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* the cookie is cleared by the server either way */
    }
    router.replace("/login");
  }

  return (
    <SessionCtx.Provider value={session}>
      <ToastCtx.Provider value={toast}>
        <div className="flex min-h-screen">
          <aside className={`${menu ? "flex" : "hidden"} fixed inset-y-0 left-0 z-30 w-60 flex-col bg-side text-white md:sticky md:top-0 md:h-screen md:shrink-0 md:flex`}>
            <div className="px-5 py-5 text-lg font-semibold tracking-tight">
              Blac Music <span className="text-violet-300">Admin</span>
            </div>
            <nav aria-label="Main" className="flex-1 space-y-0.5 px-3">
              {NAV.map((n) => {
                const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-3 py-2 text-sm ${active ? "bg-white/15 font-medium" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-white/10 p-4 text-sm">
              <div className="truncate font-medium">{user.displayName}</div>
              <div className="truncate text-xs text-white/60">{user.email}</div>
              <Button small variant="secondary" className="mt-3 w-full" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3 md:hidden">
              <Button small onClick={() => setMenuFor(menu ? null : pathname)} aria-expanded={menu} aria-label="Menu">
                ☰
              </Button>
              <span className="font-semibold">Blac Music Admin</span>
            </header>
            <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
          </div>
        </div>
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className={`pointer-events-auto max-w-sm rounded-md px-4 py-2 text-sm text-white shadow-lg ${t.kind === "error" ? "bg-red-600" : "bg-emerald-700"}`}>
              {t.text}
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </SessionCtx.Provider>
  );
}
