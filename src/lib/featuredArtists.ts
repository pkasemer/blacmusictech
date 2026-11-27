// Featured artists: guests credited on one song or on a whole release. The team's features open the
// artist's profile in the app; a name the release's own artist wrote shows as text only.

export interface Feature {
  creditId: string;
  artistId?: string;
  name: string;
  imageUrl?: string;
  verified: boolean;
  addedByTeam: boolean;
  artistBanned: boolean;
}

export interface FeaturedView {
  releaseId: string;
  /** on every song */
  release: Feature[];
  /** every track in order, with the features on that song only */
  tracks: { trackId: string; title: string; artists: Feature[] }[];
}

/** What an admin should know about a feature, if anything. */
export function featureNote(f: Feature): string {
  if (f.artistBanned) return "Banned: hidden in the app";
  if (!f.addedByTeam) return "Written by the artist: name only, no profile link";
  return "";
}

/** A name the release's artist wrote that points at a Blac artist: attaching it again at the same place links it. */
export const canLink = (f: Feature): f is Feature & { artistId: string } => !f.addedByTeam && !!f.artistId && !f.artistBanned;

/** Why an artist cannot be picked for a place, or "" when they can. */
export function pickBlock(artist: { id: string; banned: boolean }, mainArtistId: string, at: Feature[]): string {
  if (artist.id === mainArtistId) return "Main artist";
  if (artist.banned) return "Banned";
  if (at.some((f) => f.addedByTeam && f.artistId === artist.id)) return "Added";
  return "";
}

export function featuredArtistError(code: string, fallback: string): string {
  if (code === "artist_banned") return "This artist is banned.";
  if (code === "too_many_credits") return "This release already has 100 credits, the most it can hold. Remove one first.";
  if (code === "validation_error") return "That artist cannot be added here. They may no longer exist, or they are the release's own artist.";
  if (code === "not_found") return "The credits changed in the meantime. The list has been reloaded.";
  if (code === "not_available") return "The server cannot attach featured artists yet. It needs the latest Backend update.";
  return fallback;
}
