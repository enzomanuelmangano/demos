# Env-dependent features: stubbed, not ported

No build or page of the site reads a secret. What the reference site does with each `.env` key (names only, from the
reference's `.env.example` / `src/server/env`; values never read) and what the rebuild does instead:

| Feature | Reference keys | In the rebuild |
|---|---|---|
| Sign in (Google, GitHub, Apple, Patreon), session JWT | `GOOGLE_CLIENT_{ID,SECRET}`, `GITHUB_CLIENT_{ID,SECRET}`, `PATREON_CLIENT_{ID,SECRET}`, `APPLE_{TEAM_ID,CLIENT_ID,KEY_ID,PRIVATE_KEY}`, `AUTH_JWT_SECRET`, `EXPO_PUBLIC_ACCESS_KEY` | header "Sign In" drawn as today (signed-out); pressing it opens nothing yet |
| `/profile`, `/manage-subscription` | auth, `DATABASE_URL`, `LEMON_SQUEEZY_*` | edge 307 to `/demos/` (what a signed-out visitor got) |
| Payments, refunds, subscription webhook | `LEMON_SQUEEZY_{API_KEY,STORE_ID,MONTHLY_SUPPORTER_VARIANT_ID,ANNUAL_SUPPORTER_VARIANT_ID,WEBHOOK_SECRET}`, `DATABASE_URL` | not ported; no entry point is visible signed out |
| Feedback / demo requests | auth, `TELEGRAM_{BOT_TOKEN,CHAT_ID}` | the demo-post pages that showed it now redirect into the Demos app |
| Live GitHub stars and repo cards | `GITHUB_OAUTH_TOKEN` | build-time snapshot (the reference's own fallback, `src/data/github-repos.json`) |
| Analytics | `EXPO_PUBLIC_AMPLITUDE_API_KEY` | none |
| Error reporting | `EXPO_PUBLIC_SENTRY_DSN` | none |
| Website URL for the API client | `EXPO_PUBLIC_WEBSITE_URL` | not needed (no API client) |
| Media CDN | `EXPO_PUBLIC_MEDIA_CDN_URL` | public value, not a secret: written in the content where used |
| Newsletter | `BEEHIIV_{API_KEY,PUBLICATION_ID}` (server side of subs.reactiive.io only) | the form posts to the public `https://subs.reactiive.io/api/subscribe`, as today: kept |
| `/api/*` (22 routes: OAuth callbacks, webhook, purchase, feedback, stars) | all of the above | `tools/compose.ts` proxies `/api/*` to `LEGACY_API_ORIGIN` (the old Next deployment) when set; unset in this branch |
| Deploy | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (to be created) | no deploy workflow runs from this branch |
