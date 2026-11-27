// Managing the metadata lists. Entries are never deleted: an inactive one stays on the tracks that have it,
// and can no longer be newly chosen (see `offered` in metadata.ts). Ids come from the server and never change.

import type { Taxonomy } from "./metadata";

export type ListKind = "languages" | "language-groups" | "cultures" | "regions" | "genres";

export const LISTS: { kind: ListKind; label: string; one: string }[] = [
  { kind: "languages", label: "Languages", one: "language" },
  { kind: "language-groups", label: "Language groups", one: "language group" },
  { kind: "cultures", label: "Cultures", one: "culture" },
  { kind: "regions", label: "Regions", one: "region" },
  { kind: "genres", label: "Genres", one: "genre" },
];

export interface Entry {
  id: string;
  label: string;
  /** language groups have no active state */
  active?: boolean;
  groupId?: string | null;
  parentId?: string | null;
  /** tracks that have it; sent only when asked for, by a server that can manage the lists */
  usage?: number;
}

export function entries(tax: Taxonomy, kind: ListKind): Entry[] {
  return kind === "language-groups" ? tax.languageGroups : tax[kind];
}

/** An older server ignores the request for usage counts, and cannot change the lists either. */
export const canManage = (tax: Taxonomy) => (["languages", "regions", "genres"] as const).some((k) => entries(tax, k).some((e) => typeof e.usage === "number"));

export interface Row {
  entry: Entry;
  /** 1 for a subgenre shown under its genre */
  depth: 0 | 1;
}

/** One list in reading order: languages by group, subgenres under their genre. `search` matches names. */
export function rows(tax: Taxonomy, kind: ListKind, search = ""): Row[] {
  const all = entries(tax, kind);
  let out: Row[];
  if (kind === "genres") {
    const isChild = (e: Entry) => !!e.parentId && all.some((p) => p.id === e.parentId);
    out = all.filter((e) => !isChild(e)).flatMap((top) => [{ entry: top, depth: 0 as const }, ...all.filter((e) => e.parentId === top.id).map((entry) => ({ entry, depth: 1 as const }))]);
  } else if (kind === "languages") {
    const order = (e: Entry) => {
      const i = tax.languageGroups.findIndex((g) => g.id === e.groupId);
      return i < 0 ? tax.languageGroups.length : i;
    };
    out = [...all].sort((a, b) => order(a) - order(b)).map((entry) => ({ entry, depth: 0 }));
  } else {
    out = all.map((entry) => ({ entry, depth: 0 }));
  }
  const q = search.trim().toLowerCase();
  return q ? out.filter((r) => r.entry.label.toLowerCase().includes(q)) : out;
}

export const hasSubgenres = (tax: Taxonomy, id: string) => tax.genres.some((g) => g.parentId === id);

/** Subgenres are one level deep: only another top-level genre can be a parent, and a genre with subgenres cannot move. */
export function parentChoices(tax: Taxonomy, editing?: Entry): Entry[] {
  if (editing && hasSubgenres(tax, editing.id)) return [];
  return tax.genres.filter((g) => !g.parentId && g.id !== editing?.id && (g.active || g.id === editing?.parentId));
}

export interface EntryForm {
  label: string;
  /** "" for none */
  groupId: string;
  parentId: string;
}

export const formOf = (e?: Entry): EntryForm => ({ label: e?.label ?? "", groupId: e?.groupId ?? "", parentId: e?.parentId ?? "" });

/** Genre names are also stored on releases and uploads, so they are shorter. */
export const nameMax = (kind: ListKind) => (kind === "genres" ? 40 : 60);
export const nameProblem = (kind: ListKind, label: string) => (!label.trim() ? "Enter a name." : label.trim().length > nameMax(kind) ? `Use at most ${nameMax(kind)} characters.` : "");

export function createBody(kind: ListKind, f: EntryForm) {
  return {
    label: f.label.trim(),
    ...(kind === "languages" ? { groupId: f.groupId || null } : {}),
    ...(kind === "genres" ? { parentId: f.parentId || null } : {}),
  };
}

/** Only what changed, so saving one thing never rewrites another. null when nothing changed. */
export function patchBody(kind: ListKind, e: Entry, f: EntryForm): Record<string, string | null> | null {
  const before: Record<string, string | null> = createBody(kind, formOf(e));
  const changed = Object.entries(createBody(kind, f) as Record<string, string | null>).filter(([k, v]) => before[k] !== v);
  return changed.length ? Object.fromEntries(changed) : null;
}

/**
 * A switched-off genre is refused when newly sent, though a release or track that has it keeps it. This is the genre to
 * send: "" when it is no longer offered. Until the list has loaded, the genre is left as it is.
 */
export const usableGenre = (genre: string, offeredNames?: { name: string }[]) => (!offeredNames || offeredNames.some((g) => g.name.toLowerCase() === genre.toLowerCase()) ? genre : "");

export function taxonomyError(code: string, status: number, fallback: string): string {
  if (code === "not_available" || status === 405) return "The server cannot change these lists yet. It needs the latest Backend update.";
  if (code === "duplicate_label") return "That name is already in this list. It may be inactive: activate it instead of adding it again.";
  if (code === "invalid_parent") return "That genre cannot be the parent. Subgenres go one level deep.";
  if (code === "not_found") return "That entry no longer exists. Reload the page.";
  return fallback;
}
