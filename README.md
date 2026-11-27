# Blac Music Admin Site

Web admin panel for operating Blac Music: artists, releases and tracks, users, verification requests, bans, deletions,
editorial playlists, stats and an audit log. Administrator accounts only, signed in with email and password.

Next.js (App Router) + TypeScript + Tailwind. The site has its own small server side: the browser only ever talks to this
site (`/api/...`), and the site's server calls the Blac Music API. So there is no CORS, and the Backend access and refresh
tokens never reach browser JavaScript.

## Run it

```powershell
npm install
copy .env.example .env.local     # then edit
npm run dev                      # http://localhost:3100
```

Against the **mock admin API** (no Backend needed; a stand-in for the endpoints the Backend session is building):

```powershell
npm run mock                     # http://127.0.0.1:8090, sign in with admin@blac.test / mock-admin-pass
# .env.local: BACKEND_URL=http://127.0.0.1:8090
```

Against the **local Backend** (`docker compose up` in `../Backend`, API on :8080): `BACKEND_URL=http://localhost:8080`.
Sign-in needs an admin account (`UPDATE users SET role='admin' WHERE email='you@example.com'`, see the Backend README).
Until the Backend ships `POST /v1/admin/auth/login` set `ADMIN_LOGIN_FALLBACK=true` (development only, ignored in production):
the site then signs in with `/v1/auth/login` and refuses anyone whose role is not `admin`.
Admin routes the Backend has not built yet show "This feature is not available on the server yet." in the page.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Security model

| Concern | How |
|---|---|
| Admin only | The Backend's `requireAdmin` runs on every `/v1/admin/*` call (role read from the DB each time). The site also refuses to create a session for a non-admin, revokes the tokens it was just given, and answers with the same error as a wrong password. A 403 `forbidden`/`account_banned` from the Backend ends the session. |
| Session | One encrypted cookie (JWE, A256GCM, key from `SESSION_SECRET`): `HttpOnly; SameSite=Strict; Secure; Path=/`, `__Host-` prefix on https. Idle timeout 30 min (sliding), absolute 12 h (both configurable). Access tokens are refreshed on the server; parallel requests share one refresh rotation. Sign-out revokes the Backend refresh token. |
| CSRF | State-changing requests need the exact site `Origin` **and** the per-session token in `X-CSRF-Token` (synchronizer token), on top of SameSite=Strict. |
| Sign-in abuse | The Backend's per-email and per-IP lockout (429 + `Retry-After`), plus a throttle in the site in front of it. The visitor's address is sent to the Backend in `X-Forwarded-For` only when `TRUST_PROXY=true` (only the entry our own proxy appended). |
| Proxy | `/api/admin/*` maps only to `/v1/admin/*`, segments `[A-Za-z0-9._~-]`, no `..`; 1 MB body cap; no redirects followed; 15 s timeout; only JSON passes back. |
| Browser hardening | CSP with a per-request nonce, `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, no referrer, HSTS in production, `no-store` everywhere. |
| Destructive actions | Ban, takedown and revoke ask for a reason. Delete shows what will be removed (the Backend's deletion preview), and needs the exact name/email typed plus a reason. The Backend writes the audit entry in the same transaction; the audit page is read only. |
| Production guard | The site refuses to start without a 32+ character `SESSION_SECRET` and an `https://` `SITE_ORIGIN`. |

## Managing the app's content

- **Sections** (`/sections`): the titled shelves on the app's Home screen (the Backend calls them playlist groups). Create a
  section, add playlists to it, reorder, hide or delete it. A playlist can be in several sections: tick them on the playlist
  page, or add playlists from the section page.
- **Playlists**: each one needs a **cover image**. Upload it on the playlist page; the browser sends the picture to this site's
  server, which hands it to the Backend (checked and resized there), so the browser never talks to the storage host. JPEG, PNG or
  WebP, up to 10 MB.
- **Listen**: a play button on every track (playlist editor, track search, release page) plays it in a small player at the bottom.
  It uses a short-lived link from the Backend, does not count as a listen in the stats, and only works for public tracks. The
  audio host must be allowed by the page policy: `MEDIA_ORIGINS` (production: `https://blacmedia.pkasemer.com`).
- **Search insights** (`/search-insights`): what listeners search for, what grows fastest, and what they could not find. Needs the
  Backend's search logging (see `admin-search-insights-request.md` in the notes folder); until then the page says the feature is
  not available yet.

Not in v1: password reset, 2FA (recommended next), podcast shows, the signed-out showcase and import options
(their Backend endpoints exist and can be added as pages).

## Creating artists and releases

An administrator can add an artist who does not exist yet (a catalog artist with no account) and publish releases for them:

- **New artist** (Artists page, sidebar New menu, or inside the new-release wizard): name, bio, picture. Artists with the same
  name are shown first, so duplicates are a deliberate choice.
- **New release** (Releases page, an artist's page, dashboard, sidebar, Ctrl+K): choose or create the artist, then type, title,
  genre, date and cover. It starts as a draft.
- **Add tracks** on the release page: drop audio files, check the titles, confirm the rights (recorded in the audit log) and
  upload. Files go through this site's server in parts (resumable, with progress); the Backend converts them and the tracks appear.
  Reorder tracks, then **Publish** now or schedule a date.

The upload goes browser -> this site -> storage with short-lived sealed links, so the browser never talks to the storage host and
cannot make the server call an address of its choosing. Behind nginx the `/api/uploads/part` path needs a 20 MB body limit
(already in `deploy/nginx/blacadmin.conf`). Needs the Backend's "create artist and release" admin routes
(`admin-create-artist-release-request.md` in the notes folder).

### Publishing several at once, and artist pictures

- **Bulk publish**: tick releases on the Releases page (ticks stay while you change page or filter; up to 100 rows per page) or on
  an artist's page, then **Publish** now or schedule them all for one time. The site sends the ordinary publish request for each
  release in turn, so every one is checked and audited separately; failures are listed with the reason and stay ticked. You can
  stop part way, and it stops by itself if the server signs you out or limits requests.
- **Artist picture** (the cover on their profile in the app): change or remove it on the artist's page. Only for catalog artists;
  for an artist with an account it is that person's profile picture, which the Backend does not let an administrator replace.

### Who manages an artist

On an artist's page, **Transfer to a user** gives a catalog artist to the person who signed up in the app: find their account
by email or name, and record how you checked it is them (audit log). Accounts that are banned, unverified or already have an
artist cannot be chosen. **Remove from user** (needs a reason) puts the artist back in the catalog; releases stay as they are.

Rules, enforced by the Backend: songs the team uploaded before the transfer do not count against the new owner's allowance
(uploads made while they own it do, the team's included); the owner can edit and delete the existing songs; if their account
is deleted the artist returns to the catalog with the team's songs. Removal drops their unsent and failed uploads and cancels
their transfers; files already queued still become songs. Needs
`POST` and `DELETE /v1/admin/artists/{id}/owner`; an older server makes the dialogs say so.

### The artist's storage card

Only artists with an account have a storage allowance (original song uploads, drafts included): they get the bar and the form
that changes it. A catalog artist has no limit, so the card shows what is stored and no allowance. With the Backend's
`storage.breakdown` it lists published songs, unpublished songs, unfinished uploads, playback copies and pictures; without it,
only the uploaded songs.

## Song processing: stuck songs

`/processing` (sidebar "System", or `G` then `Q`) lists uploads that are stuck, being worked on, waiting, or failed in the
last 7 days, refreshed every 10 s. A **stuck** song can be retried; one being worked on offers **Restart anyway** behind a
confirmation; most failed songs cannot be retried because their file is gone. A refusal refreshes the list. The dashboard shows
a notice when something is stuck, and the Server page's alert links here. Needs the Backend's `/v1/admin/processing` routes;
until then the page says it is not available.

## Track metadata (phases 1 to 4)

Lists: `/taxonomy` adds and edits languages, language groups, cultures, regions, genres and one level of subgenres, and
activates or deactivates them. Nothing is deleted: an inactive entry stays on its tracks and cannot be newly chosen. Mood,
energy, danceability and instrumentation are fixed. Against a server without these routes the lists are read-only.
Genre names are at most 40 characters. A switched-off genre is kept where it is already used but is not sent again
(`usableGenre`): songs added to such a release get no genre.

Bulk changes: tick tracks on a release page or in a review queue (that page of the list only), then **Add or replace
metadata** (languages, genres, regions) or **Verify**. Only ticked categories change, and **Add** never overwrites. The Backend
previews every track first; nothing is applied until confirmed, and a track edited in between stops the whole apply. Albums are
never applied to their tracks automatically.

Review: in the editor, **Save and submit for review**, then verify or reject chosen values (a rejection needs a reason; values
stay recorded). `/metadata` has the review queues; the release list shows progress and filters by metadata status, tracks
waiting for review and artist. Which fields are required, and every status, comes from the Backend.

### Phase 1

A release page lists its tracks' enrichment ("3 of 8 tracks enriched"); **Enrich/Edit** opens `/releases/{id}/tracks/{trackId}`:
languages (primary/secondary, or Unknown), cultures, regions, genres (one primary), mood, energy, danceability,
instrumentation, and each saved value's source and verification. Nothing is inferred from the artist, a region or a language
group. Unsaved edits are guarded (tab close, links, keyboard and palette jumps; not the browser's Back button). Needs the
Backend routes in `catalogue-metadata-spec.md`. Later phases: review/verify and release-list filters, bulk edits, taxonomy
management. Administrators only for now.

## Lyrics and translations

Each track on a release has a **Lyrics** button (also on its metadata page). A lyric line starts with `[mm:ss.xx]`; the line directly under it, with no time, is its optional English translation. The page explains the format, checks it as you type (errors name the line and block saving), warns how many lines have no translation and previews the pairs. Text with no times is saved as plain lyrics. The rules in `src/lib/lyrics.ts` mirror the Backend's `internal/lyrics/lrc.go`; change both together. Needs the Backend's admin lyrics routes (migration `0041`).

### Timing tool

**Time with the song** on the lyrics page (`…/lyrics/sync`): paste the words, press Space as each line is sung, then add English translations line by line, now or later. Keys: Space/Enter stamp, P play/pause, arrows seek and choose a line, Backspace undo, B music break. Work that cannot be saved yet (the server only takes fully timed lyrics) is kept in the browser's local storage per song. Playing drafts needs the Backend's `GET /v1/admin/tracks/{id}/playback`; without it only public songs play. Logic: `src/lib/lyricSync.ts`.

## Reviews

**Reviews** (sidebar, with the number waiting; `G` then `W`) is the queue of artists' new releases and of changes to live ones, oldest first. A review shows the cover, details, every track with audio, lyrics, credits and, for changes, current and proposed values side by side. Approve, or reject with a reason the artist reads. A decision carries the revision that was on screen, so one on a withdrawn or since-changed submission is refused. New artist profiles and changes to an artist's name, picture or bio are in the same queue; a release cannot be approved before its artist's profile. Needs the Backend's review routes (migrations `0042` and `0043`).

## Featured artists

On a release page, **Featured artists** adds an existing Blac artist as a guest on every song or on one song, and removes them. Only features added here link to the guest's profile in the app; a name the release's own artist typed shows as text, and **Link profile** turns it into a linked one. Needs the Backend's `featured-artists` routes (migration `0040`); on an older server the card says so.

## User preference graph

A user's page draws their preferences as a connected graph (and as a list): sign-up choices, follows and listening from the
last 90 days, with artist to genre links. Filled dot = chosen or followed, ring = from listening only. Languages and
regions are only what the user chose; nothing about a person is inferred from their music. Layout rules are in
`src/lib/preferenceGraph.ts`; data from `GET /v1/admin/users/{id}/preference-graph`.

## Bulk import: keys and runs

- **API keys** (`/api-keys`): a script imports a catalogue with a key, never with your password. A key opens only the Backend's
  `/v1/admin/imports` routes, but through them it can create artists and releases and **publish them**, so give it the shortest
  expiry that works and revoke it when done. The whole key is shown **once**, in a dialog that cannot be dismissed by accident;
  the site keeps it only in that dialog's memory (not in storage, the address bar or logs). Only the prefix is listed afterwards.
- **Imports** (`/imports`): the latest 20 runs with progress, refreshed every 15 s while one is unfinished. A run's page shows each
  track, what failed and why, warnings, links to the releases, and who started it with the rights statement (from the audit log).
  A run that has not started can be cancelled. Reading a run never includes upload links.
- Contract: `backend-api-bulk-import.md` in the notes folder. Set the Backend's `ADMIN_SITE_URL` to get release links in the
  script's answers (the site builds its own links, so it works without it).

## Verified artists

On an artist's page, **Mark as verified** gives the badge, whether or not the artist asked (a waiting request is approved or
rejected there, or in the Verifications queue). **Revoke verification** removes it and needs a reason. A banned artist cannot be
verified, and the dialog warns when another verified artist has the same name. Verifying without a request needs the Backend's
`decision: "verify"`; on an older server the dialog says so.

## Server (storage and load)

`/server` (sidebar "System", or `G` then `H`) shows the machine that runs Blac Music: disk, memory, processor load and swap;
what uses the disk (original uploads, playback copies, pictures, database, everything else); the artists using the most space;
waiting uploads, imports, emails and push notifications; and history for 24 hours, 7 days or 30 days. The current figures
refresh every minute. Alerts and gauge colours come from the Backend's `alerts`; the site keeps no thresholds of its own.
A break in a history line means no reading was taken.

It is **read only**. There are no cleanup or delete actions over the API; clean up with the Backend's server scripts.
Needs the Backend's `GET /v1/admin/system` and `/v1/admin/system/history`.

## Design system ("Quiet Productivity meets Creative Studio")

- **Tokens** live in `src/app/globals.css` (`@theme`): neutral canvas/surface/border colours, accent colours for action (blue),
  brand (orange), success, warning, creative (violet) and teal; 13 px body type with Inter; 8 px controls, 14 px cards;
  borders instead of shadows, 120-200 ms transitions (and none when the person asks for reduced motion).
- **Shell**: a rounded desktop window with a fixed 208 px sidebar (brand, New, search, grouped navigation, favourites, recent,
  profile), a 52 px toolbar (breadcrumbs, favourite, search, share, more) and the workspace. Below 1024 px the sidebar becomes a
  drawer; phones get a stacked layout.
- **Studio workspace** (playlist and section editors): library on the left (collapses to a rail on narrower windows), the working
  canvas in the middle, a resizable and collapsible inspector on the right, and a docked player at the bottom.
- **Components**: `src/components/ui.tsx` (buttons, fields, cards, KPI tiles, badges, progress, tables), `menu.tsx` (tooltips,
  dropdown and right-click menus), `Dialogs.tsx`, `Workspace.tsx`, `CommandPalette.tsx`, one icon set (`icons.tsx`, Lucide).
- **Keyboard**: Ctrl/Cmd+K search and jump, `?` shortcuts, Space play/pause, `G` then a letter to go to a page; menus use the
  arrow keys, Home/End and Esc. Favourites and recent items are kept per browser.

## Layout

```
src/server/       config, session cookie, guards, Backend client, request handlers (testable: Request -> Response)
src/app/api/      thin route files over the handlers
src/app/(admin)/  dashboard, artists, verifications, releases, users, playlists, audit log
src/components/   UI kit, dialogs (reason / delete confirmation), shell, charts
src/lib/types.ts  the admin API contract as used by the site
mock/             in-memory stand-in for the admin API (npm run mock)
test/             unit tests + integration tests (real handlers against the mock over HTTP)
```

The contract the site expects is `admin-site-endpoint-requests.md` in the shared notes folder; the Backend session publishes the
final shapes in `backend-api-admin.md` there. When they differ, change `src/lib/types.ts` and the mock together.

## Production

Deployed with docker compose next to the Backend on the same VPS: see [deploy/README.md](deploy/README.md)
(`deploy/ship.sh`, nginx site, env file, DNS and certificate steps).
