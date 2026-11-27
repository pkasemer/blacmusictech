// The preference graph: what is drawn, where, and that nothing overlaps.

import { describe, expect, it } from "vitest";
import { layout, neighbours, reasons, stated, strength, type Activity, type PrefGraph, type PrefNode, type PrefType } from "@/lib/preferenceGraph";

const none: Activity = { plays: 0, finished: 0, skipped: 0, replays: 0, likes: 0, playlistAdds: 0, savedSongs: 0 };
const node = (type: PrefType, id: string, more: Partial<PrefNode> = {}, activity: Partial<Activity> = {}): PrefNode => ({ id: `${type}:${id}`, type, label: id, chosen: false, ...more, activity: { ...none, ...activity } });
const graph = (nodes: PrefNode[], links: PrefGraph["links"] = []): PrefGraph => ({ onboarding: { completed: true, updatedAt: null, discoveryMode: "" }, windowDays: 90, nodes, links });

describe("preference graph", () => {
  it("says why each preference is there, without counting skips as enjoyment", () => {
    const skipped = node("genre", "x", {}, { skipped: 5, finished: 1 });
    expect(reasons(skipped)).toEqual(["Listens to or keeps it", "Mostly skips it"]);
    expect(strength({ ...none, skipped: 9 })).toBe(0);
    expect(stated(skipped)).toBe(false);
    expect(reasons(node("language", "y", { understood: true }))).toEqual(["Understands it (chosen at setup)"]);
    expect(stated(node("artist", "z", { followed: true }))).toBe(true);
  });

  it("draws every node once, apart from the others and inside the picture", () => {
    const kinds: PrefType[] = ["language", "region", "genre", "artist"];
    for (const each of [1, 5, 12, 26]) {
      const g = graph(kinds.flatMap((k) => Array.from({ length: each }, (_, i) => node(k, `${k}${i}`, {}, { plays: i }))));
      const l = layout(g);
      expect(l.nodes).toHaveLength(each * 4);
      expect(l.hubs.map((h) => h.type)).toEqual(kinds);
      const [x, y, w, h] = l.box;
      for (const a of l.nodes) {
        expect(a.x > x && a.x < x + w && a.y > y && a.y < y + h).toBe(true);
        for (const b of l.nodes) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
      }
    }
  });

  it("leaves out hidden and empty kinds, and keeps each kind's colour", () => {
    const g = graph([node("genre", "a"), node("artist", "b")]);
    const all = layout(g);
    const some = layout(g, new Set<PrefType>(["genre"]));
    expect(all.hubs.map((h) => h.type)).toEqual(["genre", "artist"]);
    expect(some.nodes.map((n) => n.node.id)).toEqual(["artist:b"]);
    expect(some.nodes[0]!.color).toBe(all.nodes[1]!.color);
  });

  it("finds what a node connects to", () => {
    const g = graph([], [{ source: "artist:a", target: "genre:g", kind: "artist_genre", weight: 2 }]);
    expect([...neighbours(g, "genre:g")]).toEqual(["genre:g", "artist:a"]);
  });
});
