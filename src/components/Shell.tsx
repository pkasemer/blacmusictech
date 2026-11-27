"use client";

import { confirmLeave } from "@/lib/unsaved";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, setCsrf, setSignedOutHandler } from "@/lib/api";
import { CommandPalette } from "./CommandPalette";
import { Modal } from "./Dialogs";
import { IAlert, ICheck } from "./icons";
import { PageMetaProvider } from "./page-meta";
import { PlayerBar, PlayerProvider } from "./Player";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import { Button, Kbd } from "./ui";

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

const SHORTCUTS: [string, string][] = [
  ["Ctrl K", "Search and jump anywhere"],
  ["?", "Show this list"],
  ["Space", "Play or pause the current track"],
  ["G then D", "Go to Dashboard"],
  ["G then V", "Go to Verifications"],
  ["G then P", "Go to Playlists"],
  ["G then S", "Go to Sections"],
  ["G then R", "Go to Releases"],
  ["G then A", "Go to Artists"],
  ["G then U", "Go to Users"],
  ["G then I", "Go to Search insights"],
  ["G then L", "Go to Audit log"],
  ["G then M", "Go to Imports"],
  ["G then K", "Go to API keys"],
  ["G then H", "Go to Server"],
  ["G then Q", "Go to Song processing"],
  ["Esc", "Close a dialog or menu"],
];
const GO: Record<string, string> = { d: "/", v: "/verifications", p: "/playlists", s: "/sections", r: "/releases", a: "/artists", u: "/users", i: "/search-insights", l: "/audit-log", m: "/imports", k: "/api-keys", h: "/server", q: "/processing", t: "/taxonomy", w: "/reviews" };

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** Pages with a full-height, multi-panel workspace manage their own scrolling. */
const WORKSPACE_PAGE = /^\/(playlists|sections)\/[^/]+$/;

export function Shell({ user, csrf, environment, children }: { user: SessionInfo["user"]; csrf: string; environment: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [drawerFor, setDrawerFor] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const drawer = drawerFor === pathname; // closes by itself when the page changes
  const main = useRef<HTMLElement>(null);

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
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 8000 : 3500);
  }, []);
  const playerError = useCallback((m: string) => toast(m, "error"), [toast]);
  const session = useMemo(() => ({ user }), [user]);

  const signOut = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* the cookie is cleared by the server either way */
    }
    router.replace("/login");
  }, [router]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied");
    } catch {
      toast("Could not copy the link.", "error");
    }
  }, [toast]);

  // Keyboard: Ctrl/Cmd+K palette, ? shortcuts, G then a letter to navigate.
  useEffect(() => {
    let g = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") {
        e.preventDefault();
        setShortcuts(true);
      } else if (e.key.toLowerCase() === "g" && !g) {
        g = window.setTimeout(() => (g = 0), 1000);
      } else if (g) {
        const to = GO[e.key.toLowerCase()];
        window.clearTimeout(g);
        g = 0;
        if (to) {
          e.preventDefault();
          if (confirmLeave()) router.push(to);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  // a new page starts at the top
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [pathname]);

  const bleed = WORKSPACE_PAGE.test(pathname);

  return (
    <SessionCtx.Provider value={session}>
      <ToastCtx.Provider value={toast}>
        <PageMetaProvider>
          <PlayerProvider onError={playerError}>
            <a href="#main" className="sr-only z-[70] rounded-control bg-panel px-3 py-2 text-sm shadow-pop focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
              Skip to content
            </a>
            <div className="h-dvh bg-canvas md:p-2">
              {/* overflow-clip, not overflow-hidden: a hidden box can still be scrolled by focusing something inside it */}
              <div className="relative flex h-full overflow-clip bg-panel md:rounded-window md:border md:border-line md:shadow-ambient">
                {/* sidebar: fixed on desktop, a drawer on tablet and phone */}
                <div className="hidden lg:block">
                  <Sidebar user={user} environment={environment} onNavigate={() => {}} onSearch={() => setPalette(true)} onShortcuts={() => setShortcuts(true)} onSignOut={signOut} />
                </div>
                {drawer && (
                  <div className="lg:hidden">
                    <div className="absolute inset-0 z-30 bg-ink/30" onClick={() => setDrawerFor(null)} aria-hidden="true" />
                    <div className="pop-in absolute inset-y-0 left-0 z-40 shadow-pop">
                      <Sidebar
                        user={user}
                        environment={environment}
                        onNavigate={() => setDrawerFor(null)}
                        onSearch={() => (setDrawerFor(null), setPalette(true))}
                        onShortcuts={() => (setDrawerFor(null), setShortcuts(true))}
                        onSignOut={signOut}
                      />
                    </div>
                  </div>
                )}

                <div className="flex min-w-0 flex-1 flex-col">
                  <Toolbar onMenu={() => setDrawerFor(pathname)} onSearch={() => setPalette(true)} onShortcuts={() => setShortcuts(true)} onSignOut={signOut} onCopyLink={copyLink} />
                  <main
                    id="main"
                    ref={main}
                    tabIndex={-1}
                    className={bleed ? "relative flex min-h-0 flex-1 flex-col overflow-clip bg-canvas outline-none" : "scroll-thin relative min-h-0 flex-1 overflow-y-auto bg-canvas outline-none"}
                  >
                    {bleed ? children : <div className="mx-auto w-full max-w-[1180px] p-4 sm:p-6 lg:p-7">{children}</div>}
                  </main>
                  <PlayerBar />
                </div>

                <div className="pointer-events-none absolute bottom-16 right-4 z-50 flex flex-col items-end gap-2" aria-live="polite">
                  {toasts.map((t) => (
                    <div
                      key={t.id}
                      role={t.kind === "error" ? "alert" : "status"}
                      className={`pop-in pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm text-white shadow-pop ${t.kind === "error" ? "bg-danger" : "bg-ink"}`}
                    >
                      <span className="mt-0.5 shrink-0">{t.kind === "error" ? <IAlert size={15} /> : <ICheck size={15} />}</span>
                      {t.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <CommandPalette open={palette} onClose={() => setPalette(false)} onShortcuts={() => setShortcuts(true)} onSignOut={signOut} />
            <Modal open={shortcuts} title="Keyboard shortcuts" onClose={() => setShortcuts(false)}>
              <ul className="divide-y divide-line text-sm">
                {SHORTCUTS.map(([k, d]) => (
                  <li key={k} className="flex items-center justify-between py-2">
                    <span>{d}</span>
                    <span className="flex items-center gap-1">
                      {k.split(" ").map((p, i) =>
                        p === "then" ? (
                          <span key={i} className="text-xs text-faint">
                            then
                          </span>
                        ) : (
                          <Kbd key={i}>{p}</Kbd>
                        ),
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-end">
                <Button onClick={() => setShortcuts(false)}>Close</Button>
              </div>
            </Modal>
          </PlayerProvider>
        </PageMetaProvider>
      </ToastCtx.Provider>
    </SessionCtx.Provider>
  );
}
