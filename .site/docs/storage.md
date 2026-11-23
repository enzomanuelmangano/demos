# The browser storage contract: nobody loses anything at the cutover

The new site replaces the old (the reference, Next) on the same origin, `https://reactiive.io`. Browser storage is
per origin, so whatever the old site left in a reader's browser is there when the new one first loads; the owner's
requirement (2026-11-23): "as soon as I push the changes, people must NOT lose their data from localStorage". This is
the inventory of every key the old site uses, what the new site does with each, and how it is tested
(`tools/local-env/storage-continuity.ts`). Implementation: `web/storage.js` (written first in every page's head by
`tools/storage-bridge.ts`, accounts builds only), `app.contract` (the persisted states), `tools/observability.ts`
(Amplitude).

## Inventory: the old site

Found by reading the reference (`src/client/jwt`, `src/client/provider.tsx`, `src/states/analytics`,
`src/components/header/sign-in-button`, `src/app/layout.tsx`, `src/providers/analytics`; a grep for `localStorage`,
`sessionStorage`, `indexedDB`, `document.cookie`, `caches`, `atomWithStorage`, `persist`), and by dumping a signed-out
visit of the live site in Chrome (2026-11-23: `/`, `/demos`, `/articles`, `/profile`). `<k10>` is the first 10
characters of the public Amplitude key.

| Where | Key | Written by | Value | New site |
|---|---|---|---|---|
| localStorage | `@AccessStorage` | `src/client/jwt` (jotai `atomWithStorage`, `getOnInit`) after the OAuth callback's `?accessToken=`; removed by sign-out only (a 401 from `/api/user/info` shows the reader signed out but keeps the key: `src/client/index.ts`, `src/states/auth/user.ts`) | the session JWT, each char XOR `EXPO_PUBLIC_ACCESS_KEY[i % len]`, then `btoa` (no JSON); undecodable = no session | **read and written in that format**: the runtime's `accessToken` |
| localStorage | `@UtmSource` | `src/states/analytics` on a URL with `utm_source` (after Amplitude's init); never removed | plain text | **read and written**: the runtime's `utmSource` (sent with a sign-up) |
| localStorage | `reactiive:signed-in` | the header's AuthSlot: `"1"` when signed in, removed when signed out | `"1"` | **read and written**: the runtime's `signedHint`; sets `html[data-auth=in]` as the old head script did |
| localStorage | `REACTIIVE_CACHE` | TanStack Query's `createSyncStoragePersister` (throttle 1 s), `buster: '1.0'`, `maxAge` 1 week | `{ buster, timestamp, clientState: { mutations, queries } }`; the only persisted query is `['github-stars', repo]` (user info lives in jotai-tanstack-query's own, unpersisted client) | **left as is** (never read, written or removed): the star count is asked live; a rollback finds the cache |
| cookie | `AMP_<k10>` (domain `.reactiive.io`, 1 year, Lax) | Amplitude browser SDK 2.45.8 | base64 of URI-encoded JSON: `deviceId`, `sessionId`, `lastEventTime`, `optOut`, … | **the same SDK, version and init** (`tools/observability.ts`): it reads it, so the device and session ids continue |
| cookie | `AMP_MKTG_<k10>` | Amplitude (campaign attribution) | base64 JSON of the last campaign | same SDK: kept and used |
| localStorage | `AMP_unsent_<k10>` | Amplitude's event queue (events not yet sent) | JSON array of events | same SDK: flushed by it in production; never removed by the site |
| localStorage | `AMP_remote_config_<k10>` | Amplitude's remote config cache | JSON | same SDK |
| IndexedDB | `AMP_<…>_<k10>` (v1) | Amplitude | its store | same SDK; never deleted |
| sessionStorage | `AMP_URL_INFO`, `AMP_PAGE_VIEW` | Amplitude's page URL enrichment and page view plugins | JSON | same SDK |
| — | Sentry | `@sentry/nextjs` (no replay) | nothing stored | — |
| — | Cache Storage, service workers | none (checked: `caches.keys()` and registrations are empty) | | none either |
| — | `@UserStorage` | declared in `src/states/keys.ts`, never used | | not involved |
| cookie (server) | none | the API sets no cookie (no `Set-Cookie`, no `cookies()` in `src/app/api`) | | |

Anything older (keys of earlier versions of the old site, other tools) is not known here and needs not be: the new
site never enumerates, clears or removes a key it does not own.

## The new site's own keys

All of Exact's storage is under `exact.`: `exact.state.<name>` (persisted states: `accessToken`, `utmSource`,
`signedHint`), `exact.state.#scheme` / `#locale` (only if the app used them; this one does not), `exact.kept.*`
(the surface answers' cache; Exact removes only keys under its own prefix), `exact.secret.*`, `exact.devices.*`, and in
sessionStorage `exact.state.#window.*`, `exact.auth.return`, `exact.dev.*` (development builds). None collides with a
reference key; the reference ignores them, so they are harmless on a rollback.

## How the session and the settings cross (web/storage.js)

1. **At load, before the runtime reads its state**, the reference's keys are the truth: `@AccessStorage` decrypted
   becomes `exact.state.accessToken` (JSON string; `""` without one), `@UtmSource` becomes `exact.state.utmSource`,
   `reactiive:signed-in` becomes `exact.state.signedHint` and, with a session, `html[data-auth=in]`. A hint without a
   session is dropped at once (the old AuthSlot would have removed it on rendering "Sign In").
2. **Every write of the runtime** to one of those three is mirrored the reference's way (`Storage.prototype.setItem` /
   `removeItem` wrapped for `localStorage`, only for these keys): a token is encrypted into `@AccessStorage`; the change
   from a token to none (a sign-out, `useSignOut`) removes it, and nothing else does: an empty write by a runtime that
   never held a token (a new visitor, a seed that failed) is ignored; a non-empty utm source is written to
   `@UtmSource` (never removed, as the reference); the hint writes `"1"` or removes the key and `data-auth`.
   **A rejected token (401)** is not a sign-out: the page drops it from its session (`app.contract` `dropped`, the
   reader shown signed out, the hint removed, as the reference) and keeps it stored; the next visit asks again, as the
   reference's does.
   **A full quota**: a runtime key that cannot take the reference's value is removed and written again (a removal frees
   space); failing that it stays removed, so an older runtime value never wins over a newer reference key.
   **Several tabs**: Exact's own `storage` listener carries a sign-in or sign-out to the other tabs of the new site;
   the bridge follows the same events, so each tab knows the token its runtime holds.
3. **A signed-in reader on a page that starts its runtime only on intent** (D16: articles, docs, course, …): the
   runtime is started once the page is idle, so the circle reserved by `data-auth=in` becomes the avatar without a
   press. A signed-out reader's pages are unchanged (no runtime until intent).

The key `EXPO_PUBLIC_ACCESS_KEY` is public (the old site inlines it in its browser bundle) but is a value of the env:
it reaches the page only through the build's env (`.env.local`, gitignored; CI: a repository variable), never git.
`tools/storage-bridge.ts` refuses an accounts build without it, and with any other key than the old site's: a
SHA-256 fingerprint of it (salted with `reactiive-access-key:`) is committed there and checked by every build and by
the deploy workflow (`--check-key`); a wrong key would decode every stored session to garbage and overwrite it. The
key is written into the page as a JSON string (no `$` expansion; `$`, quotes, backquotes and `<` are refused).

The callback's token is in no URL after the landing (the page replaces it), nor in `history.state` or sessionStorage
(Exact keeps no navigation there): checked by the test.

## Proof: tools/local-env/storage-continuity.ts

Both sites on one origin, `http://localhost:4317`, as production will have them:

```sh
cd .site
bun tools/local-env/site-env.ts --site-port 4317 && bun run build                      # the new site, accounts on
LEGACY_API_ORIGIN=http://127.0.0.1:3017 bun tools/compose.ts
REACTIIVE_API_DIR=<reactiive>/reactiive-ref-accounts bun tools/local-env/api.ts --prod --port 3017 --site-port 4317 &   # the old site (its production build)
LEGACY_API_ORIGIN=http://127.0.0.1:3017 bun tools/serve.ts --port 4319 &                # the new site
bun tools/local-env/switch.ts &                                                         # the origin: old or new
bun tools/local-env/storage-continuity.ts [--headed]
```

One persistent Chrome profile (its default context, as a reader's), headed with `--headed`. Mocked in the browser:
`/api/user/info` for a random JWT-shaped test token (the reference's response shape, with an active monthly plan),
`/api/purchase/*` and `/api/refund/*` (never forwarded: no subscription can be touched; the cancel requests of both sites
are recorded and compared), Amplitude's and Sentry's ingestion (failed: nothing is tracked). Phases:

1. **Old site** writes everything: `?utm_source=` (`@UtmSource`, Amplitude cookies), `/demos` (`REACTIIVE_CACHE`), the
   callback landing `/profile?accessToken=` (`@AccessStorage`, `reactiive:signed-in`), a cancel on
   `/manage-subscription`.
2. **The deploy** (`POST /__switch?to=new`): signed in with the same token, `data-auth=in` before the session is known,
   same avatar, menu, signed in on an intent-activated page without a press, the utm source carried, Amplitude's
   `getDeviceId()` and session id equal to the old cookie's, `/profile` and `/manage-subscription` from the plan, the
   cancel confirmation and a cancel request identical to the old site's (method, path, `Authorization`, `Accept`,
   `Content-Type`, empty body); no localStorage key, cookie, sessionStorage key or IndexedDB database of the old site
   lost, the four reference keys byte-identical, the new keys all `exact.*` (or Amplitude's own).
3. **Rollback** (`?to=old`): still signed in, `/profile` and `/demos` work beside the new keys, same device id.
4. **Sign-out on the new site** removes `@AccessStorage` and the hint; the old site is then signed out too and kept
   `@UtmSource` and `REACTIIVE_CACHE`.
5. **Sign-in on the new site** writes `@AccessStorage` byte-equal to the reference's encryption; the old site is signed
   in with it.
6. **A brand-new visitor** (empty profile): "Sign In", no `data-auth`, no session invented, no reference key written;
   the old site works for them too.
7. **A token the API rejects (401)**: the new site shows "Sign In", keeps `@AccessStorage` byte-identical and drops the
   hint; the old site (rollback) does the same and, once the API takes the token again, both are signed in again.
8. **Two tabs of the new site**: a sign-out in one signs the other out, a sign-in signs it in; one session in the old
   format afterwards.
9. **Network**: the origin's own log (`/__switch/forwarded`) shows no `/api/purchase/*` or `/api/refund/*` request
   reached either site; the browser asked only the cancel, once per site.

Result 2026-11-24: see the table printed by the run (all PASS, headless and headed).

## Not carried, on purpose

- `REACTIIVE_CACHE` is not read: its one query is the star count, which the new site asks live with the build's
  snapshot as fallback. It stays for a rollback; after a week its own `maxAge` makes the old site discard it, as before.
- Amplitude on localhost is initialised opted out (nothing sent); in production the same SDK sends as the old site did,
  including the old queue.
