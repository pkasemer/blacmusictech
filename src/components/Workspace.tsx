"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { IChevronDown, IPanel } from "./icons";
import { IconButton, cx } from "./ui";

/** A panel width the person can drag (or nudge with the arrow keys); remembered in this browser. */
/** Whether a media query matches (read in the browser only, so server and first client render agree). */
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (f) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", f);
      return () => m.removeEventListener("change", f);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

const widthEvent = "blac-panel-width";

/** A panel width the person can drag (or nudge with the arrow keys); remembered in this browser. */
function usePanelWidth(key: string, initial: number, min: number, max: number) {
  const w = useSyncExternalStore(
    (f) => {
      window.addEventListener(widthEvent, f);
      window.addEventListener("storage", f);
      return () => {
        window.removeEventListener(widthEvent, f);
        window.removeEventListener("storage", f);
      };
    },
    () => {
      const saved = Number(window.localStorage.getItem(key));
      return saved >= min && saved <= max ? saved : initial;
    },
    () => initial,
  );
  const set = useCallback(
    (v: number) => {
      const n = Math.max(min, Math.min(max, Math.round(v)));
      try {
        window.localStorage.setItem(key, String(n));
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event(widthEvent));
    },
    [key, min, max],
  );
  return [w, set] as const;
}

function ResizeHandle({ width, onChange, min, max, label }: { width: number; onChange: (w: number) => void; min: number; max: number; label: string }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, w: width };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current) onChange(drag.current.w - (e.clientX - drag.current.x)); // dragging left makes the inspector wider
      }}
      onPointerUp={() => (drag.current = null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onChange(width + (e.key === "ArrowLeft" ? 16 : -16));
        }
      }}
      className="group relative hidden w-1.5 shrink-0 cursor-col-resize lg:block"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
    </div>
  );
}

/**
 * The studio layout: a library on the left, the working canvas in the middle (it gets the most room), and an
 * inspector on the right. On narrower screens the panels stack (canvas first) instead of squeezing.
 */
export function Workspace({
  header,
  left,
  leftTitle,
  right,
  rightTitle = "Inspector",
  children,
}: {
  header: ReactNode;
  left?: ReactNode;
  leftTitle?: string;
  right?: ReactNode;
  rightTitle?: string;
  children: ReactNode;
}) {
  const [rightW, setRightW] = usePanelWidth("blac-admin-inspector", 320, 260, 520);
  // wide windows show the library; narrower ones keep it as a thin rail until the person opens it
  const wide = useMedia("(min-width: 1280px)");
  const [leftOverride, setLeftOverride] = useState<boolean | null>(null);
  const showLeft = leftOverride ?? wide;
  const [showRight, setShowRight] = useState(true);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-2.5 sm:px-5">
        <div className="min-w-0 flex-1">{header}</div>
        {right && (
          <IconButton label={showRight ? "Hide inspector" : "Show inspector"} aria-pressed={showRight} className="hidden lg:inline-flex" onClick={() => setShowRight((s) => !s)}>
            <IPanel size={16} />
          </IconButton>
        )}
      </div>

      <div className="scroll-thin relative flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-clip">
        {left && (
          <aside aria-label={leftTitle} className={cx("order-2 flex shrink-0 flex-col border-line bg-panel lg:order-1 lg:border-r", showLeft ? "lg:w-64" : "lg:w-10")}>
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
              {showLeft && <h2 className="text-sm font-semibold">{leftTitle}</h2>}
              <IconButton small label={showLeft ? `Collapse ${leftTitle?.toLowerCase()}` : `Expand ${leftTitle?.toLowerCase()}`} className="hidden lg:inline-flex" onClick={() => setLeftOverride(!showLeft)}>
                <IChevronDown size={14} className={showLeft ? "rotate-90" : "-rotate-90"} />
              </IconButton>
            </div>
            <div className={cx("scroll-thin relative min-h-0 flex-1 overflow-y-auto p-3", !showLeft && "lg:hidden")}>{left}</div>
          </aside>
        )}

        <section aria-label="Canvas" className="scroll-thin relative order-1 min-w-0 flex-1 bg-canvas lg:order-2 lg:overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl p-4 sm:p-5">{children}</div>
        </section>

        {right && showRight && (
          <>
            <div className="order-3 hidden lg:block">
              <ResizeHandle width={rightW} onChange={setRightW} min={260} max={520} label="Resize inspector" />
            </div>
            <aside aria-label={rightTitle} style={{ ["--w" as string]: `${rightW}px` }} className="scroll-thin relative order-3 shrink-0 border-t border-line bg-panel lg:w-[var(--w)] lg:overflow-y-auto lg:border-t-0">
              <div className="flex h-10 items-center border-b border-line px-4">
                <h2 className="text-sm font-semibold">{rightTitle}</h2>
              </div>
              <div className="divide-y divide-line">{right}</div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

/** A collapsible group inside the inspector. */
export function InspectorSection({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex h-10 cursor-pointer list-none items-center justify-between px-4 text-xs font-semibold uppercase tracking-wide text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        {title}
        <IChevronDown size={14} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
