// Featured artists: who can be picked, and what the page says about a feature.

import { describe, expect, it } from "vitest";
import { canLink, featuredArtistError, featureNote, pickBlock, type Feature } from "@/lib/featuredArtists";

const feature = (more: Partial<Feature> = {}): Feature => ({ creditId: "c1", artistId: "art_g", name: "Guest", verified: false, addedByTeam: true, artistBanned: false, ...more });

describe("featured artists", () => {
  it("never offers the main artist, a banned one, or one the team already added there", () => {
    expect(pickBlock({ id: "art_m", banned: false }, "art_m", [])).toBe("Main artist");
    expect(pickBlock({ id: "art_b", banned: true }, "art_m", [])).toBe("Banned");
    expect(pickBlock({ id: "art_g", banned: false }, "art_m", [feature()])).toBe("Added");
    expect(pickBlock({ id: "art_g", banned: false }, "art_m", [feature({ addedByTeam: false })])).toBe("");
  });

  it("offers a profile link only for a name the artist wrote that points at an artist", () => {
    expect(canLink(feature({ addedByTeam: false }))).toBe(true);
    expect(canLink(feature({ addedByTeam: false, artistId: undefined }))).toBe(false);
    expect(canLink(feature({ addedByTeam: false, artistBanned: true }))).toBe(false);
    expect(canLink(feature())).toBe(false);
  });

  it("says when a feature is hidden or has no profile link", () => {
    expect(featureNote(feature())).toBe("");
    expect(featureNote(feature({ addedByTeam: false }))).toContain("no profile link");
    expect(featureNote(feature({ artistBanned: true }))).toContain("hidden");
  });

  it("explains what went wrong", () => {
    expect(featuredArtistError("too_many_credits", "x")).toContain("100");
    expect(featuredArtistError("other", "x")).toBe("x");
  });
});
