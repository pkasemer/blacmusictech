// Who manages an artist: transferring a catalog artist to a person who signed up, and taking an artist away from a user.
// The Backend makes every check; these rules only explain them before and after.

import type { UserRow } from "./types";

/** Why this account cannot be given an artist, or null when it can. */
export function cannotReceive(u: Pick<UserRow, "banned" | "hasArtist" | "emailVerified">): string | null {
  if (u.banned) return "This account is banned";
  if (u.hasArtist) return "Already has an artist profile";
  if (!u.emailVerified) return "Has not confirmed their email yet";
  return null;
}

export function ownershipError(code: string, fallback: string): string {
  switch (code) {
    case "not_available":
      return "The server cannot change who manages an artist yet. It needs the latest Backend update.";
    case "user_not_found":
      return "That account no longer exists.";
    case "already_owned":
      return "This artist already belongs to an account. Remove it from that account first.";
    case "user_has_artist":
      return "That account already has an artist profile. One account can manage one artist.";
    case "user_banned":
      return "That account is banned.";
    case "artist_banned":
      return "This artist is banned. Unban it first.";
    case "email_unverified":
      return "That person has not confirmed their email address yet.";
    case "not_owned":
      return "This artist does not belong to an account any more.";
    case "busy":
      return "One of their files is still being processed. Try again in a minute.";
    default:
      return fallback;
  }
}
