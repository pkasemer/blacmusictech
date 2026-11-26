"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ------------------------------------------------------------------ tooltip
/** A small label that appears on hover or keyboard focus. The wrapped control must carry its own accessible name. */
export function Tooltip({ label, children, side = "bottom" }: { label: string; children: ReactNode; side?: "bottom" | "top" | "right" }) {
  const pos = side === "top" ? "bottom-full left-1/2 mb-1.5 -translate-x-1/2" : side === "right" ? "left-full top-1/2 ml-1.5 -translate-y-1/2" : "left-1/2 top-full mt-1.5 -translate-x-1/2";
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden="true"
        className={cx(
          "pop-in pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-white shadow-pop [animation-delay:350ms] [animation-fill-mode:backwards] group-hover/tip:block group-has-[:focus-visible]/tip:block",
          pos,
        )}
      >
        {label}
      </span>
    </span>
  );
}

// --------------------------------------------------------------------- menu
export interface MenuItem {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  /** draws a separator line above this item */
  separated?: boolean;
}

function MenuList({ items, onClose, className, labelledBy }: { items: MenuItem[]; onClose: () => void; className?: string; labelledBy?: string }) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  useEffect(() => {
    refs.current[enabled[0] ?? 0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKey(e: React.KeyboardEvent) {
    const cur = refs.current.findIndex((el) => el === document.activeElement);
    const at = enabled.indexOf(cur);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      refs.current[enabled[(at + 1) % enabled.length] ?? 0]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      refs.current[enabled[(at - 1 + enabled.length) % enabled.length] ?? 0]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      refs.current[enabled[0] ?? 0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      refs.current[enabled[enabled.length - 1] ?? 0]?.focus();
    } else if (e.key === "Tab") {
      onClose();
    }
  }

  return (
    <div role="menu" aria-labelledby={labelledBy} onKeyDown={onKey} className={cx("pop-in min-w-48 rounded-xl border border-line bg-panel p-1 shadow-pop", className)}>
      {items.map((it, i) => {
        const inner = (
          <>
            {it.icon && <span className={cx("shrink-0", it.danger ? "text-danger" : "text-muted")}>{it.icon}</span>}
            <span className="flex-1 truncate text-left">{it.label}</span>
            {it.shortcut && <span className="ml-3 text-[11px] text-faint">{it.shortcut}</span>}
          </>
        );
        const cls = cx(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none focus-visible:bg-sunken",
          it.disabled ? "cursor-not-allowed text-faint" : it.danger ? "text-danger-ink hover:bg-danger/10 focus-visible:bg-danger/10" : "text-ink hover:bg-sunken",
        );
        return (
          <div key={`${it.label}-${i}`}>
            {it.separated && <div role="separator" className="my-1 h-px bg-line" />}
            {it.href && !it.disabled ? (
              <a
                ref={(el) => {
                  refs.current[i] = el;
                }}
                role="menuitem"
                href={it.href}
                className={cls}
                onClick={onClose}
              >
                {inner}
              </a>
            ) : (
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                role="menuitem"
                type="button"
                disabled={it.disabled}
                className={cls}
                onClick={() => {
                  onClose();
                  it.onSelect?.();
                }}
              >
                {inner}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A dropdown menu opened from a trigger button. */
export function Menu({
  items,
  align = "right",
  side = "bottom",
  fullWidth,
  trigger,
}: {
  items: MenuItem[];
  align?: "left" | "right";
  side?: "bottom" | "top";
  fullWidth?: boolean;
  trigger: (p: { open: boolean; props: { id: string; "aria-haspopup": "menu"; "aria-expanded": boolean; onClick: () => void } }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback(() => {
    setOpen(false);
    box.current?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)?.focus();
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div ref={box} className={cx("relative", fullWidth ? "flex w-full" : "inline-flex")}>
      {trigger({ open, props: { id, "aria-haspopup": "menu", "aria-expanded": open, onClick: () => setOpen((o) => !o) } })}
      {open && (
        <div className={cx("absolute z-50", side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5", align === "right" ? "right-0" : "left-0", fullWidth && "w-full")}>
          <MenuList items={items} onClose={close} labelledBy={id} />
        </div>
      )}
    </div>
  );
}

/** A right-click menu. Spread `bind` on the element and render `menu` anywhere in the tree. */
export function useContextMenu(items: MenuItem[]) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!at) return;
    const off = () => setAt(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") off();
    };
    window.addEventListener("mousedown", off);
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", off);
      window.removeEventListener("scroll", off, true);
      window.removeEventListener("resize", off);
      document.removeEventListener("keydown", onKey);
    };
  }, [at]);

  const bind = {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      setAt({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - items.length * 34 - 16) });
    },
  };
  const menu = at ? (
    <div className="fixed z-[60]" style={{ left: at.x, top: at.y }} onMouseDown={(e) => e.stopPropagation()}>
      <MenuList items={items} onClose={() => setAt(null)} />
    </div>
  ) : null;
  return { bind, menu };
}
