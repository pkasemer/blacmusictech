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

Not in v1: password reset, 2FA (recommended next), podcast shows, the signed-out showcase, Home shelves and import options
(their Backend endpoints exist and can be added as pages).

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

Needs a Node host (not a static site) behind HTTPS and, ideally, nginx. Environment: `BACKEND_URL` (server-to-server),
`SESSION_SECRET`, `SITE_ORIGIN=https://admin.<domain>`, `TRUST_PROXY=true` behind nginx, `IMAGE_ORIGINS` (where artwork is served from).
Optionally restrict `/v1/admin/` in the Backend's nginx to this site's server address. Nothing here is deployed yet.
