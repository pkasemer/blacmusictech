// Bulk metadata changes: only the ticked tracks and the ticked categories, always previewed by the server first.

import { termLabel, type AttributeKey, type LanguageRole, type Taxonomy, type Term } from "./metadata";

export type BulkMode = "add" | "replace";
export interface BulkChanges {
  languages?: { mode: BulkMode; values: { id: string; role: LanguageRole }[] };
  genres?: { mode: BulkMode; values: { id: string; primary: boolean }[] };
  regions?: { mode: BulkMode; ids: string[] };
}
export type VerifyCategory = "languages" | "genres" | "regions" | "cultures" | AttributeKey;
export const VERIFY_CATEGORIES: { key: VerifyCategory; label: string }[] = [
  { key: "languages", label: "Languages (including Unknown)" },
  { key: "genres", label: "Genres" },
  { key: "regions", label: "Regions" },
  { key: "cultures", label: "Cultural affiliations" },
  { key: "mood", label: "Mood" },
  { key: "energy", label: "Energy" },
  { key: "danceability", label: "Danceability" },
  { key: "instrumentation", label: "Instrumentation" },
];

export interface BulkValue {
  category: string;
  id: string;
}
export interface BulkRow {
  trackId: string;
  title: string;
  version: string;
  outcome: "changed" | "unchanged" | "skipped";
  reason?: string;
  added?: BulkValue[];
  removed?: BulkValue[];
  primaryChanged?: string[];
  verified?: BulkValue[];
}
export interface BulkAnswer {
  results: BulkRow[];
  changed: number;
  unchanged: number;
  skipped: number;
}

/** What the form currently says. A category counts only when its box is ticked. */
export interface BulkForm {
  languages: { on: boolean; mode: BulkMode; ids: string[]; primary: string };
  genres: { on: boolean; mode: BulkMode; ids: string[]; primary: string };
  regions: { on: boolean; mode: BulkMode; ids: string[] };
}
export const emptyForm = (): BulkForm => ({ languages: { on: false, mode: "add", ids: [], primary: "" }, genres: { on: false, mode: "add", ids: [], primary: "" }, regions: { on: false, mode: "add", ids: [] } });

/** The request's changes, or null while nothing is chosen or a ticked category has no value yet. */
export function buildChanges(f: BulkForm): BulkChanges | null {
  const ticked = [f.languages, f.genres, f.regions].filter((c) => c.on);
  if (ticked.length === 0 || ticked.some((c) => c.ids.length === 0)) return null;
  const out: BulkChanges = {};
  if (f.languages.on) out.languages = { mode: f.languages.mode, values: f.languages.ids.map((id) => ({ id, role: id === f.languages.primary ? "primary" : "secondary" })) };
  if (f.genres.on) out.genres = { mode: f.genres.mode, values: f.genres.ids.map((id) => ({ id, primary: id === f.genres.primary })) };
  if (f.regions.on) out.regions = { mode: f.regions.mode, ids: f.regions.ids };
  return out;
}

export const versionsOf = (a: BulkAnswer) => Object.fromEntries(a.results.map((r) => [r.trackId, r.version]));

export function valueName(v: BulkValue, tax: Taxonomy): string {
  if (v.category === "languageUnknown" || (v.category === "languages" && v.id === "")) return "Language: Unknown";
  const lists: Record<string, [string, Term[]]> = {
    languages: ["Language", tax.languages],
    genres: ["Genre", tax.genres],
    regions: ["Region", tax.regions],
    cultures: ["Culture", tax.cultures],
    mood: ["Mood", tax.attributes.mood],
    energy: ["Energy", tax.attributes.energy],
    danceability: ["Danceability", tax.attributes.danceability],
    instrumentation: ["Instrumentation", tax.attributes.instrumentation],
  };
  const [label, terms] = lists[v.category] ?? [v.category, [] as Term[]];
  return `${label}: ${termLabel(terms, v.id)}`;
}

export function skipReason(reason: string | undefined): string {
  if (reason === "language_unknown") return "Marked as Unknown language, so nothing on this track is changed";
  return reason ?? "Skipped";
}

export function bulkError(code: string, status: number, fallback: string): string {
  if (code === "not_available" || status === 405) return "The server cannot change several tracks yet. It needs the latest Backend update.";
  if (code === "stale_version") return "Someone changed one of these tracks after the preview, so nothing was applied. Preview again.";
  if (code === "invalid_taxonomy") return "One of the choices is no longer available. Close this and choose again.";
  if (code === "not_found") return "One of these tracks no longer exists, so nothing was applied.";
  return fallback;
}
