// A user's preferences as a connected graph: the person, a hub per kind, one node per preference, and artist -> genre
// links. It shows only what the user chose and what they did. Nothing about the person is worked out from their music:
// languages and regions appear only when the user picked them.

export type PrefType = "language" | "region" | "genre" | "artist";

export interface Activity {
  plays: number;
  finished: number;
  skipped: number;
  replays: number;
  likes: number;
  playlistAdds: number;
  savedSongs: number;
}

export interface PrefNode {
  id: string;
  type: PrefType;
  label: string;
  imageUrl?: string;
  /** picked while setting up the app (for a language: preferred) */
  chosen: boolean;
  /** languages: listed as understood */
  understood?: boolean;
  followed?: boolean;
  activity: Activity;
}

export interface PrefLink {
  source: string;
  target: string;
  kind: "artist_genre";
  weight: number;
}

export interface PrefGraph {
  onboarding: { completed: boolean; updatedAt: string | null; discoveryMode: string };
  windowDays: number;
  nodes: PrefNode[];
  links: PrefLink[];
}

/** In drawing order. The colour belongs to the kind, so hiding one never repaints another (validated for all pairs). */
export const GROUPS: { type: PrefType; label: string; color: string }[] = [
  { type: "language", label: "Languages", color: "#2a78d6" },
  { type: "region", label: "Regions", color: "#d95926" },
  { type: "genre", label: "Genres", color: "#12a89a" },
  { type: "artist", label: "Artists", color: "#4a3aa7" },
];

export const DISCOVERY: Record<string, string> = { familiar: "Familiar music", explore_more: "Explore more", everything_uganda: "Everything Ugandan" };

export const ACTIVITY: [keyof Activity, string][] = [
  ["plays", "Plays"],
  ["finished", "Finished"],
  ["skipped", "Skipped"],
  ["replays", "Replays"],
  ["likes", "Likes"],
  ["playlistAdds", "Added to playlists"],
  ["savedSongs", "Saved songs"],
];

/** How much the user engages with it. Skips are not enjoyment, and "finished" mostly repeats plays. */
export const strength = (a: Activity) => Math.max(a.plays, a.finished) + a.replays + a.likes + a.playlistAdds + a.savedSongs;

/** The user said so themselves, rather than it only showing up in their listening. */
export const stated = (n: PrefNode) => n.chosen || !!n.understood || !!n.followed;

export const mostlySkips = (a: Activity) => a.skipped >= 2 && a.skipped > a.finished;

/** Why this preference is on the graph, in words. */
export function reasons(n: PrefNode): string[] {
  const out: string[] = [];
  if (n.chosen) out.push(n.type === "language" ? "Preferred, chosen at setup" : "Chosen at setup");
  if (n.understood) out.push("Understands it (chosen at setup)");
  if (n.followed) out.push("Follows this artist");
  if (strength(n.activity) > 0) out.push("Listens to or keeps it");
  if (mostlySkips(n.activity)) out.push("Mostly skips it");
  return out;
}

export interface Point {
  x: number;
  y: number;
}
export interface PlacedNode extends Point {
  node: PrefNode;
  r: number;
  color: string;
  anchor: "start" | "middle" | "end";
  labelX: number;
  labelY: number;
}
export interface Layout {
  /** [minX, minY, width, height]; the person is at 0,0 */
  box: [number, number, number, number];
  hubs: (Point & { type: PrefType; label: string; color: string; count: number })[];
  nodes: PlacedNode[];
}

const STRETCH = 1.3; // wider than tall, so side labels have room
const LABEL = 150;

/** A fixed radial layout: the same data always draws the same way, and nodes never overlap. */
export function layout(graph: PrefGraph, hidden: ReadonlySet<PrefType> = new Set()): Layout {
  const groups = GROUPS.filter((g) => !hidden.has(g.type))
    .map((g) => ({
      ...g,
      items: graph.nodes.filter((n) => n.type === g.type).sort((a, b) => Number(stated(b)) - Number(stated(a)) || strength(b.activity) - strength(a.activity) || a.label.localeCompare(b.label)),
    }))
    .filter((g) => g.items.length > 0);

  // artists sit near the genres they link to: the genre arc ends where the artist arc begins
  const genreOrder = new Map((groups.find((g) => g.type === "genre")?.items ?? []).map((n, i) => [n.id, i]));
  const home = (artist: string) => {
    const best = graph.links.filter((l) => l.source === artist && genreOrder.has(l.target)).sort((a, b) => b.weight - a.weight)[0];
    return best ? genreOrder.get(best.target)! : -1;
  };
  for (const g of groups) if (g.type === "artist") g.items.sort((a, b) => home(b.id) - home(a.id));

  const total = groups.reduce((s, g) => s + g.items.length, 0);
  const slots = total + groups.length; // one empty slot between groups
  const rings = total > 36 ? 3 : total > 18 ? 2 : 1;
  const outer = Math.max(230, slots * 7.5);
  const top = Math.max(1, ...graph.nodes.map((n) => strength(n.activity)));
  const at = (angle: number, radius: number): Point => ({ x: Math.round(Math.cos(angle) * radius * STRETCH), y: Math.round(Math.sin(angle) * radius) });

  const out: Layout = { box: [0, 0, 0, 0], hubs: [], nodes: [] };
  let slot = 0.5;
  let i = 0;
  for (const g of groups) {
    const angleOf = (s: number) => -Math.PI + (s / slots) * 2 * Math.PI;
    out.hubs.push({ type: g.type, label: g.label, color: g.color, count: g.items.length, ...at(angleOf(slot + g.items.length / 2), 105) });
    for (const node of g.items) {
      const angle = angleOf(slot + 0.5);
      const p = at(angle, outer + (i % rings) * 55);
      const r = Math.round(7 + 13 * Math.sqrt(strength(node.activity) / top));
      const side = Math.cos(angle);
      const anchor = side > 0.3 ? "start" : side < -0.3 ? "end" : "middle";
      out.nodes.push({
        node,
        color: g.color,
        r,
        ...p,
        anchor,
        labelX: p.x + (anchor === "start" ? r + 5 : anchor === "end" ? -r - 5 : 0),
        labelY: p.y + (anchor === "middle" ? (Math.sin(angle) < 0 ? -r - 7 : r + 15) : 4),
      });
      slot++;
      i++;
    }
    slot++;
  }
  const reachX = Math.max(260, ...out.nodes.map((n) => Math.abs(n.x))) + LABEL;
  const reachY = Math.max(170, ...out.nodes.map((n) => Math.abs(n.y))) + 40;
  out.box = [-reachX, -reachY, reachX * 2, reachY * 2];
  return out;
}

/** A node and everything it links to: what stays bright when it is picked. */
export function neighbours(graph: PrefGraph, id: string): Set<string> {
  const out = new Set([id]);
  for (const l of graph.links) {
    if (l.source === id) out.add(l.target);
    if (l.target === id) out.add(l.source);
  }
  return out;
}

export const short = (label: string, max = 20) => (label.length > max ? `${label.slice(0, max - 1)}…` : label);
