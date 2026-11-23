# The env-dependent features on localhost

How to run the site with the owner's real env values, what each feature needs (by variable NAME only), and what is
verified. Design: `decisions.md` D15. Never commit a value: `bun tools/check-secrets.ts` before every commit.

## The env file

The owner's Vercel pull lives outside every repo: `<reactiive>/.secrets/reactiive-io.production.env` (chmod 600).
`REACTIIVE_ENV_FILE` points elsewhere. It holds **production** values, so the local tools disarm what would write or
send to production (below). It is read only by `tools/local-env/env-file.ts`, from the process that needs it; nothing
prints a value. The only local copy is `.site/.env.local` (gitignored, checked by `git check-ignore` before writing),
and it holds public values only.

## Run it

```sh
cd .site
bun tools/local-env/api.ts --site-port 4314 &       # the reference's Next API on :3000 (a git-archive copy, see below)
bun tools/local-env/site-env.ts --site-port 4314    # .env.local: SITE_ACCOUNTS=1 + the public keys
bun run build                                        # site (+ observability), as CI does
LEGACY_API_ORIGIN=http://localhost:3000 bun tools/compose.ts   # with it, /profile is the site's page
LEGACY_API_ORIGIN=http://localhost:3000 bun tools/serve.ts --port 4314 &
bun tools/local-env/e2e.ts http://localhost:4314     # the end-to-end check (below)
```

`tools/compose.ts` needs the Demos app's artifact for HEAD's key (`bun tools/demos-web/build.ts`, or a copy of
another worktree's `.out/demos-web/<key>/`). `bun tools/local-env/site-env.ts --off` returns to the public build.
Use the same port everywhere: the OAuth `redirect_uri` and the page's API base are `http://localhost:<port>`.

**The API.** `tools/local-env/api.ts` runs `next dev` from `<reactiive>/reactiive-api-local`, a copy of the
reference made with `git archive HEAD | tar -x` (never a worktree; the reference clone is not touched), with
`bun install` and its `content:build`. The env file's values reach the Next process's environment only (no `.env`
file anywhere; the launcher refuses to start if the copy has one), filtered to the reference's own names
(`.env.example`), with these overrides because the values are production's:

| Override | Why |
|---|---|
| `EXPO_PUBLIC_WEBSITE_URL=http://localhost:<site port>` | the OAuth `redirect_uri` and the post-sign-in redirect land on the local site |
| `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_*` removed | the API's errors never reach the production Sentry project |
| `LEMON_SQUEEZY_*` removed | payments are not ported; nothing may create a checkout |
| `BEEHIIV_API_KEY` inert | a local sign-in subscribes nobody to the newsletter |
| `TELEGRAM_BOT_TOKEN` inert (`--telegram` keeps it) | no message reaches the production chat |

`DATABASE_URL` is kept: user/info and the owner's own sign-in read and upsert the owner's row, nothing else. Never
run the reference's migration, refund or webhook scripts against it.

**The proxy.** `tools/serve.ts` proxies `/api/*` to `LEGACY_API_ORIGIN` (when set at serve time, or by the composed
route): redirects passed through unfollowed (OAuth), `Set-Cookie` kept, bodies re-encoded, `X-Forwarded-Host` set.
Same origin, as production's rewrite to the old deployment.

## Features and the variables they need

| Feature | Site build (public, inlined) | API (server, never in the site) |
|---|---|---|
| Accounts on (Sign In opens, avatar, `/profile`) | `SITE_ACCOUNTS=1`, `EXPO_PUBLIC_WEBSITE_URL` | `AUTH_JWT_SECRET`, `DATABASE_URL` |
| Sign in with Google | | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, (`BEEHIIV_*`, `TELEGRAM_*` on sign-up) |
| Sign in with Apple | | `APPLE_TEAM_ID`, `APPLE_CLIENT_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` |
| Feedback | | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| Live GitHub stars | | `GITHUB_OAUTH_TOKEN` (optional: the route falls back to its snapshot) |
| Amplitude | `EXPO_PUBLIC_AMPLITUDE_API_KEY` (tools/observability.ts) | |
| Sentry (client) | `EXPO_PUBLIC_SENTRY_DSN` (tools/observability.ts) | |
| Newsletter form | none (posts to `https://subs.reactiive.io/api/subscribe`) | `BEEHIIV_*` live on subs.reactiive.io's own server |
| `/api/*` in production | | `LEGACY_API_ORIGIN` (repository variable, compose time) |

Not ported: payments (Lemon Squeezy: checkout, plan cards, subscription modals, webhook, refunds; owner's call) and
the GitHub / Patreon "connect" flows (the reference's `ConnectionBox` is not rendered on its live pages). See
`stubs.md`.

## OAuth on localhost: what the owner must add

The reference builds every `redirect_uri` as `${EXPO_PUBLIC_WEBSITE_URL}/api/callback/<provider>`; it has no separate
localhost flow. Probed against the production clients (an unauthenticated GET of each authorize URL, no consent):

| Provider | Accepts today | To sign in on localhost |
|---|---|---|
| Google | `https://reactiive.io/api/callback/google` only: `www`, and `localhost`/`127.0.0.1` on 3000, 4314, 8080, 8081 with the paths `/api/callback/google`, `/api/auth/callback/google`, `/callback/google`, `/auth/callback/google` and none, all answer `redirect_uri_mismatch` (checked 2026-11-23, also in headless Chrome) | add `http://localhost:4314/api/callback/google` to the OAuth client's Authorized redirect URIs (Google Cloud console, Credentials) |
| Apple | Apple refuses `http` and `localhost` return URLs | not possible locally; test on a preview with a real https domain registered in the Services ID |
| GitHub (connect, not in the live UI) | one callback URL per OAuth app | a separate development OAuth app with `http://localhost:4314/api/callback/github` |
| Patreon (connect, not in the live UI) | redirect URIs listed on the client | add `http://localhost:4314/api/callback/patreon` |

Until Google's URI is added, a local sign-in stops at Google's error page; everything after the callback (token in
the URL, session, profile, sign out) is verified with a test token (below).

## What the e2e check verifies (`tools/local-env/e2e.ts`)

Headless Chrome against the composed site and the local API. Real requests where nothing is written: the sign-in URLs
(`/api/auth/{google,apple}-sign-up`: host and `redirect_uri` checked), a rejected token (the real API's 401 signs out
and forgets it), the live star count. Mocked in the browser (CDP Fetch) where a real session would be needed or a
message would be sent: `/api/user/info` for a test token, `/api/feedback/submit` (method, path, `Authorization`, JSON
body checked; no Telegram message). Steps: Sign In opens the dialog, Escape closes it; the callback landing
`/profile?accessToken=…` keeps the token and cleans the URL; avatar, menu (name, email), `/profile`; the session
survives navigation and reload; feedback; sign out; `/profile` signed out goes to `/demos`; Amplitude initialised
opted out and Sentry disabled on localhost, and no request to either's ingestion. 25/25 on 2026-11-23.

## Analytics and errors on localhost

`tools/observability.ts` writes the SDK loader into each page only when the build has the public keys. On
`localhost`/`127.0.0.1` Amplitude initialises with `optOut: true` (it logs what it would track) and Sentry with
`enabled: false, debug: true`: nothing is sent to the production projects. Elsewhere the reference's config applies.
