"use client";

import { confirmLeave } from "@/lib/unsaved";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { favorites, recents, type SavedItem } from "@/lib/listStore";
import { REVIEWS_CHANGED, type ReviewList } from "@/lib/reviews";
import { useApi, usePoll } from "@/lib/useApi";
import { ICheck, IFolder, IActivity, IServer, IImport, IKey, IDashboard, IDisc, IKeyboard, ILayers, ILogOut, IMic, IMore, IPlaylist, IPlus, IScroll, ISearch, IShield, IStar, ITrend, IUsers, IClock } from "./icons";
import { Menu } from "./menu";
import { Avatar, Kbd, cx } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: <IDashboard /> },
      { href: "/reviews", label: "Reviews", icon: <ICheck /> },
      { href: "/verifications", label: "Verifications", icon: <IShield /> },
    ],
  },
  {
    title: "Content",
    items: [
      { href: "/playlists", label: "Playlists", icon: <IPlaylist /> },
      { href: "/sections", label: "Sections", icon: <ILayers /> },
      { href: "/featured", label: "Featured releases", icon: <IStar /> },
      { href: "/releases", label: "Releases", icon: <IDisc /> },
      { href: "/metadata", label: "Metadata review", icon: <ICheck /> },
      { href: "/taxonomy", label: "Metadata lists", icon: <IFolder /> },
      { href: "/artists", label: "Artists", icon: <IMic /> },
    ],
  },
  {
    title: "Bulk import",
    items: [
      { href: "/imports", label: "Imports", icon: <IImport /> },
      { href: "/api-keys", label: "API keys", icon: <IKey /> },
    ],
  },
  {
    title: "People and insight",
    items: [
      { href: "/users", label: "Users", icon: <IUsers /> },
      { href: "/recommendations", label: "Recommendations", icon: <IStar /> },
      { href: "/search-insights", label: "Search insights", icon: <ITrend /> },
      { href: "/audit-log", label: "Audit log", icon: <IScroll /> },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/processing", label: "Song processing", icon: <IActivity /> },
      { href: "/server", label: "Server", icon: <IServer /> },
    ],
  },
];

const KIND_ICON: Record<string, ReactNode> = { import: <IImport />, artist: <IMic />, user: <IUsers />, release: <IDisc />, playlist: <IPlaylist />, section: <ILayers /> };

function Row({ href, active, icon, children, count, onNavigate }: { href: string; active: boolean; icon: ReactNode; children: ReactNode; count?: number; onNavigate: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cx("flex h-8 items-center gap-2.5 rounded-control px-2.5 text-sm", active ? "bg-sunken font-medium text-ink" : "text-muted hover:bg-sunken/70 hover:text-ink")}
    >
      <span className={active ? "text-primary" : "text-faint"}>{icon}</span>
      <span className="truncate">{children}</span>
      {!!count && (
        <span className="ml-auto shrink-0 rounded-full bg-warning/15 px-1.5 text-[11px] font-semibold tabular-nums text-warning-ink" aria-label={`${count} waiting`}>
          {count}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({
  user,
  environment,
  onNavigate,
  onSearch,
  onShortcuts,
  onSignOut,
}: {
  user: { displayName: string; email: string };
  environment: string;
  onNavigate: () => void;
  onSearch: () => void;
  onShortcuts: () => void;
  onSignOut: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const favs = favorites.use();
  const recent = recents.use().filter((r) => !favs.some((f) => f.href === r.href)).slice(0, 5);
  // how many releases are waiting; read again on each page change and once a minute
  const reviews = useApi<ReviewList>("/reviews?status=pending&limit=1");
  const again = reviews.reload;
  useEffect(() => again(), [pathname, again]);
  usePoll(true, again, 60_000);
  useEffect(() => {
    window.addEventListener(REVIEWS_CHANGED, again);
    return () => window.removeEventListener(REVIEWS_CHANGED, again);
  }, [again]);
  const waiting = reviews.data?.pending ?? 0;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const saved = (title: string, list: SavedItem[], icon: ReactNode) =>
    list.length > 0 && (
      <div>
        <div className="mb-1 flex items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
          {icon}
          {title}
        </div>
        {list.map((it) => (
          <Row key={it.href} href={it.href} active={pathname === it.href} icon={KIND_ICON[it.kind] ?? <IDashboard />} onNavigate={onNavigate}>
            {it.title}
          </Row>
        ))}
      </div>
    );

  return (
    <div className="flex h-full w-[208px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 px-4">
        <Image src="/logo.png" alt="" width={22} height={22} priority unoptimized className="size-[22px] shrink-0" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">Blac Music</div>
          <div className="truncate text-[11px] text-muted">{environment}</div>
        </div>
      </div>

      <div className="space-y-2 px-3 pb-2">
        <Menu
          align="left"
          fullWidth
          items={[
            { label: "New release", icon: <IDisc />, onSelect: () => void (confirmLeave() && router.push("/releases/new")) },
            { label: "New artist", icon: <IMic />, onSelect: () => void (confirmLeave() && router.push("/artists?new=1")) },
            { label: "New playlist", icon: <IPlaylist />, onSelect: () => void (confirmLeave() && router.push("/playlists?new=1")), separated: true },
            { label: "New section", icon: <ILayers />, onSelect: () => void (confirmLeave() && router.push("/sections?new=1")) },
          ]}
          trigger={({ props }) => (
            <button {...props} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-control bg-primary text-sm font-medium text-white hover:bg-primary-dark">
              <IPlus size={15} /> New
            </button>
          )}
        />
        <button onClick={onSearch} className="flex h-8 w-full items-center gap-2 rounded-control border border-line bg-panel px-2.5 text-sm text-faint hover:border-[#d4d4da]">
          <ISearch size={14} />
          <span className="flex-1 text-left">Search</span>
          <Kbd>Ctrl K</Kbd>
        </button>
      </div>

      <nav aria-label="Main" className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-faint">{g.title}</div>
            {g.items.map((n) => (
              <Row key={n.href} href={n.href} active={isActive(n.href)} icon={n.icon} count={n.href === "/reviews" ? waiting : undefined} onNavigate={onNavigate}>
                {n.label}
              </Row>
            ))}
          </div>
        ))}
        {saved("Favorites", favs, <IStar size={11} />)}
        {saved("Recent", recent, <IClock size={11} />)}
      </nav>

      <div className="shrink-0 border-t border-line p-2">
        <Menu
          align="left"
          side="top"
          fullWidth
          items={[
            { label: "Keyboard shortcuts", icon: <IKeyboard />, shortcut: "?", onSelect: onShortcuts },
            { label: "Sign out", icon: <ILogOut />, danger: true, separated: true, onSelect: onSignOut },
          ]}
          trigger={({ props }) => (
            <button {...props} className="flex w-full items-center gap-2.5 rounded-control p-1.5 text-left hover:bg-sunken">
              <Avatar name={user.displayName} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-medium">{user.displayName}</span>
                <span className="block truncate text-[11px] text-muted">{user.email}</span>
              </span>
              <IMore size={15} className="text-faint" />
            </button>
          )}
        />
      </div>
    </div>
  );
}
