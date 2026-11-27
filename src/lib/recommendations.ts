// The recommendation engine's three reports: the shapes of the Backend's routes and how they are worded.
// The engine and its numbers live in the Backend (docs/RECOMMENDATIONS.md); this only shows what it answers.

export interface Readiness {
  algorithm: string;
  songs: { playable: number; withGenre: number; withVerifiedLanguage: number; withVerifiedRegion: number; withVerifiedCulture: number; withVerifiedSound: number };
  listeners: { counted: number; withChoices: number; heardTenSongs: number; leftOut: number };
}

export interface OutcomeRow {
  surface: string;
  algorithm: string;
  slot: string;
  suggested: number;
  listened: number;
  completed: number;
  skipped: number;
  kept: number;
  listeners: number;
}
export interface Outcomes {
  days: number;
  rows: OutcomeRow[];
}

export interface Suggestion {
  trackId: string;
  title: string;
  artistId: string;
  artistName: string;
  slot: string;
  score: number;
  reasons: string[];
  parts: Record<string, number>;
}
export interface Suggestions {
  algorithm: string;
  discoveryMode: string;
  candidates: number;
  basis: {
    preferredLanguages: string[];
    understoodLanguages: string[];
    regions: string[];
    genres: string[];
    favouriteArtists: number;
    followedArtists: number;
    songsWithHistory: number;
  };
  items: Suggestion[];
}

export const SURFACE_LABEL: Record<string, string> = { mix: "Start mix", autoplay: "Autoplay", your_sound: "Your sound" };
export const SLOT_LABEL: Record<string, string> = { familiar: "Familiar", discovery: "Discovery" };
export const MODE_LABEL: Record<string, string> = { familiar: "Familiar Sounds", explore_more: "Explore More", everything_uganda: "Everything Uganda" };

const REASONS: Record<string, string> = {
  favourite_artist: "Favourite artist",
  followed_artist: "Followed artist",
  artist_you_play: "Artist they play",
  genre_you_chose: "Genre they chose",
  genre_you_play: "Genre they play",
  preferred_language: "Preferred language",
  understood_language: "Language they understand",
  language_you_play: "Language they play",
  your_region: "Region they chose",
  region_you_play: "Region they play",
  ugandan_region: "Ugandan region",
  similar_sound: "Sound they like",
  popular_now: "Popular now",
  new_release: "Recently released or added",
  liked: "Liked or saved",
  on_repeat: "Played often",
  new_artist_for_you: "New artist to them",
  under_discovered: "Little-heard artist",
  new_tradition: "New language or region",
  same_artist: "Same artist as the start",
  similar_genre: "Genre like the start",
  same_language: "Same language as the start",
  same_culture: "Same culture as the start",
  same_region: "Same region as the start",
  same_sound: "Sound like the start",
};

const PARTS: Record<string, string> = {
  artist: "Artist",
  genre: "Genre",
  language: "Language",
  region: "Region",
  sound: "Sound",
  popularity: "Popularity",
  quality: "Finished against skipped",
  fresh: "Newness",
  kept: "Liked or saved",
  on_repeat: "Played often",
  heard_lately: "Heard recently",
  skipped_lately: "Skipped recently",
  like_the_seed: "Likeness to the starting song (0 to 1)",
  discovery_rank: "Rank among new artists",
};

/** A reason or part the server added after this site was built still shows, as words. */
const words = (code: string) => code.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export const reasonLabel = (code: string) => REASONS[code] ?? words(code);

/** The parts of a score in a fixed order: what adds up first, then the two that are not part of that sum. */
export function scoreParts(parts: Record<string, number>): { id: string; label: string; value: number }[] {
  const order = Object.keys(PARTS);
  const at = (id: string) => (order.indexOf(id) + 1 || order.length + 1);
  return Object.entries(parts)
    .sort(([a], [b]) => at(a) - at(b) || a.localeCompare(b))
    .map(([id, value]) => ({ id, label: PARTS[id] ?? words(id), value }));
}

export const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Under this many listens a percentage says too much: the counts are shown instead. */
export const FEW_LISTENS = 20;

/** A share of the songs listened to, worded for how much there is to go on. */
export function shareOfListened(part: number, listened: number): string {
  if (listened === 0) return "–";
  if (listened < FEW_LISTENS) return `${part} of ${listened}`;
  return `${percent(part, listened)}% (${part})`;
}

export interface Coverage {
  id: string;
  label: string;
  count: number;
  total: number;
  percent: number;
  /** Where the team can fill the gap, when there is a list for it. */
  href?: string;
}

export function coverage(songs: Readiness["songs"]): Coverage[] {
  const row = (id: string, label: string, count: number, href?: string): Coverage => ({ id, label, count, total: songs.playable, percent: percent(count, songs.playable), href });
  return [
    row("genre", "Genre", songs.withGenre, "/metadata"),
    row("language", "Verified language", songs.withVerifiedLanguage, "/metadata"),
    row("region", "Verified region", songs.withVerifiedRegion, "/metadata"),
    row("culture", "Verified culture", songs.withVerifiedCulture, "/metadata"),
    row("sound", "Verified mood, energy or instruments", songs.withVerifiedSound),
  ];
}

/** A shown percentage never reads 0 for something that is there, or 100 for something that is not complete. */
export function shownPercent(c: Pick<Coverage, "count" | "total">): string {
  if (c.total === 0 || c.count === 0) return "0%";
  if (c.count >= c.total) return "100%";
  const p = (c.count / c.total) * 100;
  return p < 1 ? "under 1%" : `${Math.min(99, Math.round(p))}%`;
}

/** What the gaps mean for listeners, said only while they matter. */
export function gaps(songs: Readiness["songs"]): string[] {
  if (songs.playable === 0) return ["There are no playable songs to suggest."];
  const out: string[] = [];
  const few = (n: number) => n < songs.playable * 0.2;
  if (few(songs.withVerifiedLanguage)) out.push(`Listeners' language choices can only affect ${songs.withVerifiedLanguage} of ${songs.playable} songs.`);
  if (few(songs.withVerifiedRegion)) out.push(`Their region choices can only affect ${songs.withVerifiedRegion} of ${songs.playable} songs.`);
  const noGenre = songs.playable - songs.withGenre;
  if (noGenre > 0) out.push(`${noGenre} ${noGenre === 1 ? "song has" : "songs have"} no genre: a mix from one stays with the same artist, or songs sharing verified details.`);
  return out;
}

/** True when the server is older than the report being asked for. */
export const notAvailable = (error: { code: string; status: number } | undefined) => !!error && (error.code === "not_available" || error.status === 405);

/** A song or artist kept out of suggestions. */
export interface Block {
  id: number;
  kind: "track" | "artist";
  targetId: string;
  name: string;
  artistName: string;
  songs: number;
  reason: string;
  blockedBy: { id: string; email: string } | null;
  blockedAt: string;
}
export interface BlockTarget {
  kind: "track" | "artist";
  id: string;
  name: string;
}

export const blockDescription = (kind: BlockTarget["kind"]) =>
  `${kind === "artist" ? "None of this artist's songs, including ones added later, will" : "This song will not"} be suggested in mixes, autoplay or Your sound from the next list. ` +
  "Anything the server had put in a listener's Your sound is taken out; songs listeners added themselves stay. It still plays and appears in search. Queues already on a phone do not change.";

export const unblockDescription = (b: Pick<Block, "kind">) =>
  `${b.kind === "artist" ? "This artist's songs" : "This song"} can be suggested again from the next list. What was taken out of Your sound is not put straight back; it can be suggested again later.` +
  (b.kind === "artist" ? " Songs blocked one by one stay blocked." : " If its artist is blocked, it stays out until the artist is unblocked.");

export const blockedMessage = (removed: number) =>
  removed === 0 ? "Blocked from suggestions" : `Blocked, and taken out of Your sound in ${removed} ${removed === 1 ? "place" : "places"}`;

/** A song with no artist has a stand-in id, which is not an artist to block. */
export const isArtist = (artistId: string) => artistId !== "" && !artistId.startsWith("none:");
