"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { breadcrumbs } from "@/lib/breadcrumbs";
import { favorites } from "@/lib/listStore";
import { ICopy, IKeyboard, ILogOut, IMenu, IMore, ISearch, IShare, IStar } from "./icons";
import { Menu } from "./menu";
import { usePageMeta } from "./page-meta";
import { IconButton, Kbd, cx } from "./ui";

const KIND_BY_ROOT: Record<string, string> = { imports: "import", artists: "artist", users: "user", releases: "release", playlists: "playlist", sections: "section" };

/** The 52px bar above the workspace: where you are, favourite, search, share and more. */
export function Toolbar({
  onMenu,
  onSearch,
  onShortcuts,
  onSignOut,
  onCopyLink,
}: {
  onMenu: () => void;
  onSearch: () => void;
  onShortcuts: () => void;
  onSignOut: () => void;
  onCopyLink: () => void;
}) {
  const pathname = usePathname();
  const meta = usePageMeta();
  const crumbs = breadcrumbs(pathname, meta.title);
  const favs = favorites.use();
  const starred = favs.some((f) => f.href === pathname);
  const here = crumbs[crumbs.length - 1]!;
  const root = pathname.split("/").filter(Boolean)[0] ?? "";

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-panel px-3 md:px-4">
      <IconButton label="Open menu" className="lg:hidden" onClick={onMenu}>
        <IMenu size={17} />
      </IconButton>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={c.href} className={cx("flex min-w-0 items-center gap-1.5", !last && "hidden sm:flex")}>
                {i > 0 && <span className="hidden text-faint sm:inline">/</span>}
                {last ? (
                  <span aria-current="page" className="truncate font-medium">
                    {c.label}
                  </span>
                ) : (
                  <Link href={c.href} className="truncate text-muted hover:text-ink">
                    {c.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <IconButton
        label={starred ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={starred}
        onClick={() => favorites.toggle({ href: pathname, title: here.label === "…" ? pathname : here.label, kind: meta.kind ?? KIND_BY_ROOT[root] ?? "page" })}
        className={starred ? "text-warning" : undefined}
      >
        <IStar size={16} fill={starred ? "currentColor" : "none"} />
      </IconButton>

      <button onClick={onSearch} className="hidden h-8 w-56 items-center gap-2 rounded-control border border-line bg-panel px-2.5 text-sm text-faint hover:border-[#d4d4da] md:flex" aria-label="Search (Ctrl K)">
        <ISearch size={14} />
        <span className="flex-1 text-left">Search…</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <IconButton label="Search" className="md:hidden" onClick={onSearch}>
        <ISearch size={16} />
      </IconButton>

      <IconButton label="Copy link to this page" onClick={onCopyLink}>
        <IShare size={16} />
      </IconButton>

      <Menu
        items={[
          { label: "Copy link", icon: <ICopy />, onSelect: onCopyLink },
          { label: "Keyboard shortcuts", icon: <IKeyboard />, shortcut: "?", onSelect: onShortcuts },
          { label: "Sign out", icon: <ILogOut />, danger: true, separated: true, onSelect: onSignOut },
        ]}
        trigger={({ props }) => (
          <button {...props} aria-label="More options" className="inline-flex size-8 items-center justify-center rounded-control text-muted hover:bg-sunken hover:text-ink">
            <IMore size={16} />
          </button>
        )}
      />
    </header>
  );
}
