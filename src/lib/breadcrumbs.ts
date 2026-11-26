export interface Crumb {
  label: string;
  href: string;
}

const LABELS: Record<string, string> = {
  verifications: "Verifications",
  artists: "Artists",
  releases: "Releases",
  users: "Users",
  playlists: "Playlists",
  sections: "Sections",
  "search-insights": "Search insights",
  "audit-log": "Audit log",
  imports: "Imports",
  "api-keys": "API keys",
  server: "Server",
};

/** The breadcrumb trail for a path. `title` names the open item (an artist, a playlist...) once it has loaded. */
export function breadcrumbs(pathname: string, title?: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const out: Crumb[] = [{ label: "Dashboard", href: "/" }];
  if (parts.length === 0) return out;
  const first = parts[0]!;
  out.push({ label: LABELS[first] ?? first, href: `/${first}` });
  if (parts[1]) out.push({ label: title || "…", href: `/${first}/${parts[1]}` });
  return out;
}

/** Page titles for the sidebar and the command palette. */
export const PAGES: { href: string; label: string; keywords: string }[] = [
  { href: "/", label: "Dashboard", keywords: "home overview stats" },
  { href: "/verifications", label: "Verifications", keywords: "verify approve artists requests" },
  { href: "/playlists", label: "Playlists", keywords: "editorial cover tracks" },
  { href: "/sections", label: "Sections", keywords: "shelves home groups" },
  { href: "/releases", label: "Releases", keywords: "albums singles tracks takedown" },
  { href: "/artists", label: "Artists", keywords: "profiles verified" },
  { href: "/users", label: "Users", keywords: "accounts ban" },
  { href: "/search-insights", label: "Search insights", keywords: "searches queries gaps" },
  { href: "/imports", label: "Imports", keywords: "bulk import runs catalogue progress" },
  { href: "/api-keys", label: "API keys", keywords: "tokens import script revoke" },
  { href: "/audit-log", label: "Audit log", keywords: "history actions" },
  { href: "/server", label: "Server", keywords: "storage disk memory load vps capacity health alerts" },
];
