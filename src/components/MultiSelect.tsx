"use client";

import { useId, useState, type ReactNode } from "react";
import { IClose } from "./icons";
import { SearchField, cx } from "./ui";

export interface Option {
  id: string;
  label: string;
  /** a heading only: a group can never be ticked as a whole */
  group?: string;
}

/**
 * A searchable list of tick boxes with the chosen values shown above it. The list opens inside the page (never clipped),
 * and closes with Escape or by moving focus elsewhere. `extra` adds controls to a chosen value (a role, a badge).
 */
export function MultiSelect({ label, options, value, onChange, extra, disabled, emptyText = "Nothing chosen" }: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (ids: string[]) => void;
  extra?: (id: string) => ReactNode;
  disabled?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const listId = useId();
  const term = q.trim().toLowerCase();
  const shown = options.filter((o) => !term || o.label.toLowerCase().includes(term) || o.group?.toLowerCase().includes(term));
  const groups = [...new Set(shown.map((o) => o.group ?? ""))];
  const name = (id: string) => options.find((o) => o.id === id)?.label ?? id;

  return (
    <div
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      {value.length === 0 ? (
        <p className="mb-2 text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="mb-2 space-y-1" aria-label={`Chosen: ${label}`}>
          {value.map((id) => (
            <li key={id} className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-sunken/50 py-1 pl-2.5 pr-1 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{name(id)}</span>
              {extra?.(id)}
              <button type="button" disabled={disabled} onClick={() => onChange(value.filter((x) => x !== id))} aria-label={`Remove ${name(id)}`} className="rounded p-1 text-muted hover:bg-sunken hover:text-ink">
                <IClose size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <SearchField aria-label={`Search ${label.toLowerCase()}`} aria-expanded={open} aria-controls={listId} disabled={disabled} placeholder={`Add ${label.toLowerCase()}…`} value={q} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={(e) => (setQ(e.target.value), setOpen(true))} />
      {open && !disabled && (
        <div id={listId} role="group" aria-label={label} className="relative mt-1 max-h-56 overflow-y-auto rounded-control border border-line bg-panel py-1">
          {shown.length === 0 && <p className="px-3 py-2 text-sm text-muted">No match.</p>}
          {groups.map((g) => (
            <div key={g}>
              {g && <p className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{g}</p>}
              {shown
                .filter((o) => (o.group ?? "") === g)
                .map((o) => (
                  <label key={o.id} className={cx("flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-sunken/70", value.includes(o.id) && "font-medium")}>
                    <input type="checkbox" className="size-4 accent-primary" checked={value.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))} />
                    {o.label}
                  </label>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
