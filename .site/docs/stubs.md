# Env-dependent features: what is ported, what is stubbed

No build or page of the site reads a secret. The accounts' client side is ported (branch `site-env`,
`decisions.md` D15, `local-env.md`): it is ON only in a build with `SITE_ACCOUNTS=1`; without it (the public build)
everything below behaves as the "stub" column says. What the reference site does with each `.env` key (names only, from the
reference's `.env.example` / `src/server/env`; values never read) and what the rebuild does instead:

| Feature | Reference keys | In the rebuild |
|---|---|---|
| Sign in (Google, Apple), session JWT | `GOOGLE_CLIENT_{ID,SECRET}`, `APPLE_{TEAM_ID,CLIENT_ID,KEY_ID,PRIVATE_KEY}`, `AUTH_JWT_SECRET` | ported (components/account): the sign-in modal, the reference's Bearer JWT from `/profile?accessToken=`, kept in the reference's own localStorage key and format (`@AccessStorage`, needs the public `EXPO_PUBLIC_ACCESS_KEY` in the build: `docs/storage.md`), so a reader of the old site stays signed in; avatar and menu (Profile, Support Demos / Manage Support, Sign out). Without the env: "Sign In" opens the same dialog at once (owner); its provider buttons ask `/api/*` and, when nothing answers, show "Sign in is not available right now" as a toast and ask again |
| `/profile` | auth, `DATABASE_URL` | ported: the SubscriptionBox (for a supporter only: its no-plan face invites a purchase), the feedback card, mobile sign-out. Without the env (or `LEGACY_API_ORIGIN`): edge 307 to `/demos` |
| Payments: `/manage-subscription`, checkout, plan cards, subscription modals, refunds, webhook | `LEMON_SQUEEZY_*`, `DATABASE_URL` | **status and cancel only (owner, 2026-11-23)**: `/manage-subscription` shows the page's header, and for a subscriber the warning banners' text, the current plan's card without its price (features, Current Plan / Cancelled badge, "Cancel Plan" while active), the confirmation "Cancel subscription?" and POST `/api/purchase/cancel-subscription` exactly as the reference; Plan Benefits. No prices, no purchase, upgrade, downgrade, resume, refund request or "This was unexpected" (the banners keep their text; the billing warning keeps its "Review Billing Details" link). Without a plan: the header and paragraph only. Without the env: 307 to `/demos`. The old deployment keeps the webhook |
| Feedback | auth, `TELEGRAM_{BOT_TOKEN,CHAT_ID}` | ported on `/profile` (the feedback modal, POST `/api/feedback/submit`); demo requests lived on the demo posts, which redirect into the Demos app |
| Live GitHub stars | `GITHUB_OAUTH_TOKEN` (server) | ported: the /demos pill asks `/api/github/stars` on the reader's page; the build-time snapshot (3,248) is the fallback and the public build's value |
| Analytics | `EXPO_PUBLIC_AMPLITUDE_API_KEY` | ported (tools/observability.ts): the reference's init and its one event, `utm_source_open`; opted out on localhost |
| Error reporting | `EXPO_PUBLIC_SENTRY_DSN` | ported (tools/observability.ts, client only): the reference's options; disabled on localhost. Sentry's user, subscription context and tags as the reference's `useSentryUserContext` (components/account/account.ts) |
| Website URL for the API client | `EXPO_PUBLIC_WEBSITE_URL` | the accounts' API base (public); `SITE_ACCOUNTS=1` turns them on |
| Media CDN | `EXPO_PUBLIC_MEDIA_CDN_URL` | public value, not a secret: written in the content where used |
| Newsletter | `BEEHIIV_{API_KEY,PUBLICATION_ID}` (server side of subs.reactiive.io only) | the form posts to the public `https://subs.reactiive.io/api/subscribe`, as today: kept |
| `/api/*` (22 routes: OAuth callbacks, webhook, purchase, feedback, stars) | all of the above | `tools/compose.ts` proxies `/api/*` to `LEGACY_API_ORIGIN` (the old Next deployment) when set; locally `tools/serve.ts` proxies it to the reference's API run by `tools/local-env/api.ts` |
| GitHub / Patreon "connect" | `GITHUB_CLIENT_*`, `PATREON_CLIENT_*` | not ported: the reference's ConnectionBox is not rendered on any live page (its API routes stay on the old deployment) |
| Deploy | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (to be created) | no deploy workflow runs from this branch |
