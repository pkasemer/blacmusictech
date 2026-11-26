"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { ApiError } from "@/lib/api";
import { IAlert, IChevronDown, IInbox, ISearch } from "./icons";
import { Tooltip } from "./menu";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ------------------------------------------------------------------ buttons
type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark disabled:bg-primary/45",
  secondary: "border border-line bg-panel text-ink hover:bg-sunken disabled:text-faint",
  danger: "bg-danger text-white hover:bg-danger-ink disabled:bg-danger/40",
  ghost: "text-muted hover:bg-sunken hover:text-ink disabled:text-faint",
};

export function Button({
  variant = "secondary",
  small,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium disabled:cursor-not-allowed",
        small ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
        variants[variant],
        className,
      )}
    />
  );
}

/** A square icon-only button. `label` is the accessible name and the tooltip. */
export function IconButton({
  label,
  variant = "ghost",
  small,
  className,
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & { label: string; variant?: Variant; small?: boolean }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        {...rest}
        className={cx(
          "inline-flex shrink-0 items-center justify-center rounded-control disabled:cursor-not-allowed",
          small ? "size-7" : "size-8",
          variants[variant],
          className,
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

// -------------------------------------------------------------------- fields
const control = "w-full rounded-control border border-line bg-panel px-2.5 text-sm text-ink placeholder:text-faint hover:border-[#d4d4da] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-sunken disabled:text-faint";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={cx(!/(^|\s)w-/.test(className ?? "") && "w-full", "h-8 rounded-control border border-line bg-panel px-2.5 text-sm text-ink placeholder:text-faint hover:border-[#d4d4da] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-sunken disabled:text-faint", className)} />;
});

export function SearchField({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cx("relative", className)}>
      <ISearch size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
      <input type="search" {...rest} className="h-8 w-full rounded-control border border-line bg-panel pl-8 pr-2.5 text-sm text-ink placeholder:text-faint hover:border-[#d4d4da] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
    </div>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(control, "py-2", className)} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx("relative inline-block", /(^|\s)w-full/.test(className ?? "") && "w-full")}>
      <select {...rest} className={cx("h-8 w-full appearance-none rounded-control border border-line bg-panel pl-2.5 pr-7 text-sm text-ink hover:border-[#d4d4da] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20", className)} />
      <IChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-faint" />
    </span>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

// ------------------------------------------------------------------- badges
const tones = {
  gray: "bg-sunken text-muted",
  green: "bg-success/10 text-success-ink",
  amber: "bg-warning/15 text-warning-ink",
  red: "bg-danger/10 text-danger-ink",
  blue: "bg-primary/10 text-primary-ink",
  purple: "bg-creative/10 text-creative-ink",
  teal: "bg-teal/10 text-teal-ink",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4", tones[tone])}>{children}</span>;
}

/** A coloured status dot with a label. */
export function Dot({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  const c = { gray: "bg-faint", green: "bg-success", amber: "bg-warning", red: "bg-danger", blue: "bg-primary", purple: "bg-creative", teal: "bg-teal" }[tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={cx("size-1.5 rounded-full", c)} aria-hidden="true" />
      {children}
    </span>
  );
}

export function Progress({ value, label, tone = "blue" }: { value: number; label: string; tone?: Tone }) {
  const bar = { gray: "bg-faint", green: "bg-success", amber: "bg-warning", red: "bg-danger", blue: "bg-primary", purple: "bg-creative", teal: "bg-teal" }[tone];
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 rounded-full bg-sunken" role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-1.5 rounded-full", bar)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary-ink" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-line bg-sunken px-1 font-sans text-[11px] font-medium text-muted">{children}</kbd>;
}

// -------------------------------------------------------------------- layout
export function Card({ title, actions, children, className, flush }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cx("rounded-card border border-line bg-panel", className)}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between gap-3 px-4 pt-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className={flush ? "pt-2" : "p-4"}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A KPI card: label, large value, optional icon and a change line. */
export function Tile({ label, value, sub, tone, icon, href }: { label: string; value: string; sub?: string; tone?: "warn"; icon?: ReactNode; href?: string }) {
  const body = (
    <div className={cx("h-full rounded-card border border-line bg-panel p-4", href && "hover:border-[#d4d4da]")}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted">{label}</div>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <div className={cx("mt-2 text-2xl font-semibold tabular-nums tracking-tight", tone === "warn" && "text-warning-ink")}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-card">
      {body}
    </Link>
  ) : (
    body
  );
}

export function ErrorBox({ error, onRetry }: { error: ApiError | Error | string; onRetry?: () => void }) {
  const msg = typeof error === "string" ? error : error.message;
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-control border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger-ink">
      <span className="flex items-center gap-2">
        <IAlert size={15} />
        {msg}
      </span>
      {onRetry && (
        <Button small onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line bg-panel px-4 py-10 text-center text-sm text-muted">
      <span className="text-faint">{icon ?? <IInbox size={20} />}</span>
      <div>{children}</div>
    </div>
  );
}

/** Skeleton rows while data loads (screen readers hear "Loading"). */
export function Loading({ label = "Loading…", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-2 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-9" style={{ opacity: 1 - i * 0.18 }} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-panel">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={cx("border-b border-line bg-sunken/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted first:rounded-tl-card last:rounded-tr-card", className)}>
    {children}
  </th>
);
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cx("border-b border-line px-4 py-2 align-middle last:border-b-0 [tr:last-child_&]:border-b-0", className)}>{children}</td>
);

export function Pagination({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return total > 0 ? <div className="mt-3 text-xs text-muted">{total} result{total === 1 ? "" : "s"}</div> : null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <div className="mt-3 flex items-center justify-between text-xs">
      <span className="text-muted">
        {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button small disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <span className="text-muted">
          Page {page} of {pages}
        </span>
        <Button small disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-2.5 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
