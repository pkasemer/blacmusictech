// Track enrichment metadata: the shapes of the Backend's metadata routes and the editing rules.
// Everything here is entered by a person. Nothing is ever filled in from the artist, a region or a language group.

export type Source = "artist_submission" | "admin" | "ai_suggestion" | "imported";
export type Verification = "pending" | "verified" | "rejected";
export type MetadataStatus = "not_started" | "in_progress" | "pending_review" | "verified";
export type LanguageRole = "primary" | "secondary";

export interface Provenance {
  source: Source;
  verification: Verification;
  confidence: number | null;
  verifiedBy: { id: string; email: string } | null;
  verifiedAt: string | null;
}
export type Linked = { id: string } & Provenance;

export const ATTRIBUTES = [
  { key: "mood", label: "Mood", single: false },
  { key: "energy", label: "Energy", single: true },
  { key: "danceability", label: "Danceability", single: true },
  { key: "instrumentation", label: "Instrumentation", single: false },
] as const;
export type AttributeKey = (typeof ATTRIBUTES)[number]["key"];

export interface Term {
  id: string;
  label: string;
  active: boolean;
}
export interface Taxonomy {
  languageGroups: { id: string; label: string }[];
  languages: (Term & { groupId: string | null })[];
  cultures: Term[];
  regions: Term[];
  genres: (Term & { parentId: string | null })[];
  attributes: Record<AttributeKey, Term[]>;
}

export interface TrackMetadata {
  trackId: string;
  title: string;
  trackNumber: number | null;
  durationMs: number;
  artist: { id: string; name: string };
  featuredArtists: string[];
  release: { id: string; title: string; type: "single" | "album"; kind?: string; releaseDate: string | null };
  isrc: string | null;
  status: MetadataStatus;
  languageUnknown: boolean;
  languages: ({ role: LanguageRole } & Linked)[];
  cultures: Linked[];
  regions: Linked[];
  genres: ({ primary: boolean } & Linked)[];
  attributes: Record<AttributeKey, Linked[]>;
  version: string;
  updatedAt: string | null;
  updatedBy: { id: string; email: string } | null;
  // review (absent on a server without it)
  submittedAt?: string | null;
  submittedBy?: { id: string; email: string } | null;
  /** the review of "Unknown": it is a classification too, and can be verified */
  languageUnknownReview?: Provenance | null;
  missingRequired?: RequiredField[];
  /** the note of the latest rejection */
  reviewNote?: string;
}
export type RequiredField = "language" | "genre" | "culture" | "region";
export const REQUIRED_LABEL: Record<RequiredField, string> = { language: "a language (or Unknown)", genre: "a genre", culture: "a cultural affiliation", region: "a region" };
export const supportsReview = (t: Pick<TrackMetadata, "missingRequired">) => Array.isArray(t.missingRequired);

export type ReviewCategory = "languages" | "languageUnknown" | "cultures" | "regions" | "genres" | AttributeKey;
export interface ReviewItem {
  category: ReviewCategory;
  /** "" for the Unknown language classification */
  id: string;
  categoryLabel: string;
  name: string;
  link: Provenance;
}
export const itemKey = (i: Pick<ReviewItem, "category" | "id">) => `${i.category}:${i.id}`;

/** Every saved value of a track, as one list to read and review. */
export function reviewItems(t: TrackMetadata, tax: Taxonomy): ReviewItem[] {
  const rows = (category: ReviewCategory, categoryLabel: string, terms: Term[], links: Linked[]): ReviewItem[] => links.map((l) => ({ category, categoryLabel, id: l.id, name: termLabel(terms, l.id), link: l }));
  return [
    ...(t.languageUnknown && t.languageUnknownReview ? [{ category: "languageUnknown" as const, id: "", categoryLabel: "Language", name: "Unknown or unclassified", link: t.languageUnknownReview }] : []),
    ...rows("languages", "Language", tax.languages, t.languages),
    ...rows("cultures", "Culture", tax.cultures, t.cultures),
    ...rows("regions", "Region", tax.regions, t.regions),
    ...rows("genres", "Genre", tax.genres, t.genres),
    ...ATTRIBUTES.flatMap((a) => rows(a.key, a.label, tax.attributes[a.key], t.attributes[a.key])),
  ];
}

export const QUEUES = [
  { value: "pending_review", label: "Waiting for review" },
  { value: "no_language", label: "No language" },
  { value: "unverified_language", label: "Language not verified" },
  { value: "no_genre", label: "No genre" },
  { value: "culture_region_review", label: "Culture or region to review" },
  { value: "incomplete", label: "Incomplete" },
] as const;
export type Queue = (typeof QUEUES)[number]["value"];
export interface QueueTrack {
  trackId: string;
  title: string;
  releaseId: string;
  releaseTitle: string;
  releaseType: "single" | "album";
  artist: { id: string; name: string };
  status: MetadataStatus;
  missingRequired: RequiredField[];
  languageUnknown: boolean;
}
export interface QueueList {
  tracks: QueueTrack[];
  total: number;
  counts: Record<Queue, number>;
}

export interface ReleaseMetadata {
  releaseId: string;
  tracks: TrackMetadata[];
}

/** What the editor changes. */
export interface Draft {
  languageUnknown: boolean;
  languages: { id: string; role: LanguageRole }[];
  cultures: string[];
  regions: string[];
  genres: { id: string; primary: boolean }[];
  attributes: Record<AttributeKey, string[]>;
}

const ids = (list: { id: string }[] | undefined) => (list ?? []).map((x) => x.id);

export function toDraft(m: TrackMetadata): Draft {
  return {
    languageUnknown: m.languageUnknown,
    languages: m.languages.map((l) => ({ id: l.id, role: l.role })),
    cultures: ids(m.cultures),
    regions: ids(m.regions),
    genres: m.genres.map((g) => ({ id: g.id, primary: g.primary })),
    attributes: { mood: ids(m.attributes.mood), energy: ids(m.attributes.energy), danceability: ids(m.attributes.danceability), instrumentation: ids(m.attributes.instrumentation) },
  };
}

/** Order of picking does not matter, only what is chosen and its role. */
function canonical(d: Draft): string {
  const s = (a: string[]) => [...a].sort();
  return JSON.stringify([
    d.languageUnknown,
    s(d.languages.map((l) => `${l.id}:${l.role}`)),
    s(d.cultures),
    s(d.regions),
    s(d.genres.map((g) => `${g.id}:${g.primary}`)),
    ATTRIBUTES.map((a) => s(d.attributes[a.key])),
  ]);
}
export const sameDraft = (a: Draft, b: Draft) => canonical(a) === canonical(b);

/** Keeps the roles already given; the first language picked starts as the primary one, later ones as secondary. */
export function withLanguages(d: Draft, chosen: string[]): Draft {
  const kept = d.languages.filter((l) => chosen.includes(l.id));
  const added = chosen.filter((id) => !kept.some((l) => l.id === id));
  const languages = [...kept];
  for (const id of added) languages.push({ id, role: languages.length === 0 ? "primary" : "secondary" });
  return { ...d, languages, languageUnknown: languages.length > 0 ? false : d.languageUnknown };
}

/** There is at most one primary language: choosing one makes the others secondary. */
export function setLanguageRole(d: Draft, id: string, role: LanguageRole): Draft {
  return { ...d, languages: d.languages.map((l) => (l.id === id ? { id, role } : role === "primary" ? { ...l, role: "secondary" } : l)) };
}

/** "Unknown" and a list of languages exclude each other. */
export const setUnknownLanguage = (d: Draft, unknown: boolean): Draft => ({ ...d, languageUnknown: unknown, languages: unknown ? [] : d.languages });

export function withGenres(d: Draft, chosen: string[]): Draft {
  const kept = d.genres.filter((g) => chosen.includes(g.id));
  const genres = [...kept];
  for (const id of chosen) if (!genres.some((g) => g.id === id)) genres.push({ id, primary: genres.length === 0 });
  return { ...d, genres };
}
export const setPrimaryGenre = (d: Draft, id: string): Draft => ({ ...d, genres: d.genres.map((g) => ({ id: g.id, primary: g.id === id })) });

export const payload = (d: Draft, version: string) => ({ version, ...d });

export const STATUS_LABEL: Record<MetadataStatus, string> = { not_started: "Not started", in_progress: "In progress", pending_review: "Pending review", verified: "Verified" };
export const SOURCE_LABEL: Record<Source, string> = { artist_submission: "Artist submission", admin: "Admin", ai_suggestion: "AI suggestion", imported: "Imported" };
export const VERIFICATION_LABEL: Record<Verification, string> = { pending: "Not verified", verified: "Verified", rejected: "Rejected" };

/** "3 of 8 tracks enriched": enriched means something has been entered. */
export function completion(tracks: Pick<TrackMetadata, "status">[]): { enriched: number; verified: number; total: number } {
  return { enriched: tracks.filter((t) => t.status !== "not_started").length, verified: tracks.filter((t) => t.status === "verified").length, total: tracks.length };
}

/** A term's name, marking ones that have been switched off. */
export function termLabel(terms: Term[], id: string): string {
  const t = terms.find((x) => x.id === id);
  return t ? (t.active ? t.label : `${t.label} (inactive)`) : id;
}

/** What can be offered: active terms, plus inactive ones already chosen so they can be seen and removed. */
export const offered = <T extends Term>(terms: T[], chosen: string[]): T[] => terms.filter((t) => t.active || chosen.includes(t.id));

export function metadataError(code: string, status: number, fallback: string): string {
  if (code === "not_available" || status === 405) return "The server cannot save track metadata yet. It needs the latest Backend update.";
  if (code === "stale_version") return "Someone else changed this track after you opened it, so nothing was saved. Reload the track, then make your changes again.";
  if (code === "invalid_taxonomy") return "One of the choices is no longer available. Reload the page and choose again.";
  if (code === "missing_required") return "Something required is still missing, so it cannot be submitted yet.";
  if (code === "not_found") return "That track no longer exists.";
  return fallback;
}
