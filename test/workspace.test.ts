import { describe, expect, it } from "vitest";
import { breadcrumbs, PAGES } from "@/lib/breadcrumbs";
import { parseList, pushRecent, toggleItem, type SavedItem } from "@/lib/listStore";

const item = (n: number): SavedItem => ({ href: `/users/${n}`, title: `User ${n}`, kind: "user" });

describe("breadcrumbs", () => {
  it("starts at the dashboard and names the section", () => {
    expect(breadcrumbs("/")).toEqual([{ label: "Dashboard", href: "/" }]);
    expect(breadcrumbs("/playlists")).toEqual([
      { label: "Dashboard", href: "/" },
      { label: "Playlists", href: "/playlists" },
    ]);
    expect(breadcrumbs("/search-insights").at(-1)?.label).toBe("Search insights");
  });
  it("shows the opened item's name, or a placeholder while it loads", () => {
    expect(breadcrumbs("/artists/art_1", "Tunde").at(-1)).toEqual({ label: "Tunde", href: "/artists/art_1" });
    expect(breadcrumbs("/artists/art_1").at(-1)?.label).toBe("…");
  });
  it("every page in the palette has a distinct address and a label", () => {
    expect(new Set(PAGES.map((p) => p.href)).size).toBe(PAGES.length);
    for (const p of PAGES) expect(p.label.length).toBeGreaterThan(1);
  });
});

describe("recent and favourite lists", () => {
  it("puts the newest first, moves a repeat to the front, and caps the length", () => {
    let l: SavedItem[] = [];
    for (const n of [1, 2, 3, 4]) l = pushRecent(l, item(n), 3);
    expect(l.map((x) => x.title)).toEqual(["User 4", "User 3", "User 2"]);
    l = pushRecent(l, item(2), 3);
    expect(l.map((x) => x.title)).toEqual(["User 2", "User 4", "User 3"]);
  });
  it("toggles an item on and off", () => {
    const on = toggleItem([], item(1), 5);
    expect(on).toHaveLength(1);
    expect(toggleItem(on, item(1), 5)).toEqual([]);
  });
  it("reads stored data defensively", () => {
    expect(parseList(null)).toEqual([]);
    expect(parseList("not json")).toEqual([]);
    expect(parseList('{"a":1}')).toEqual([]);
    // only same-site paths are accepted, so a tampered value cannot become an outside link
    const raw = JSON.stringify([item(1), { href: "https://evil.example/x", title: "x", kind: "user" }, { href: "/ok", title: 5, kind: "user" }, null]);
    expect(parseList(raw)).toEqual([item(1)]);
    const long = parseList(JSON.stringify([{ href: "/a", title: "t".repeat(500), kind: "k".repeat(500) }]));
    expect(long[0]!.title).toHaveLength(80);
    expect(long[0]!.kind).toHaveLength(20);
  });
});
