// The release review queue: what the page says about waiting items and refused decisions.

import { describe, expect, it } from "vitest";
import { creditText, decisionError, fieldText, kindLabel, outdated, waited, type ReviewRow } from "@/lib/reviews";

describe("release reviews", () => {
  it("says how long something has waited", () => {
    const now = Date.parse("2026-11-28T12:00:00Z");
    expect([waited("2026-11-28T11:55:00Z", now), waited("2026-11-28T07:00:00Z", now), waited("2026-11-25T12:00:00Z", now)]).toEqual(["5 min", "5 h", "3 days"]);
  });

  it("reads the review again when it is no longer what was on screen", () => {
    expect([outdated("not_pending"), outdated("review_changed"), outdated("uploads_pending")]).toEqual([true, true, false]);
    expect(decisionError("review_changed", "x")).toContain("check it again");
    expect(decisionError("other", "x")).toBe("x");
  });

  it("tells releases and artist profiles apart", () => {
    const row = (subject: ReviewRow["subject"], kind: ReviewRow["kind"]) => ({ subject, kind }) as ReviewRow;
    expect([kindLabel(row("profile", "new")), kindLabel(row("profile", "update")), kindLabel(row("release", "new")), kindLabel(row(undefined, "update"))]).toEqual(["New artist profile", "Profile changes", "New release", "Release changes"]);
    expect(decisionError("profile_pending", "x")).toContain("Approve the profile first");
    expect(outdated("profile_pending")).toBe(false);
  });

  it("words changed values and credits", () => {
    expect([fieldText("explicit", false), fieldText("trackNumber", 0), fieldText("description", ""), fieldText("title", "New")]).toEqual(["No", "Not set", "None", "New"]);
    const tracks = [{ trackId: "t1", title: "Song", durationMs: 1, explicit: false }];
    expect(creditText({ name: "Jo", role: "featured_artist", trackId: "t1" }, tracks)).toBe("Jo · featured artist · Song");
    expect(creditText({ name: "jo", artistName: "Jo B", role: "other", roleLabel: "Choir" }, tracks)).toBe("Jo B · Choir · every song");
  });
});
